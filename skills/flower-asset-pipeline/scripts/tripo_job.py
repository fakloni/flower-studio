"""One resumable Tripo v3 task per output directory. Dry-run is the default."""
import argparse
from hashlib import sha256
import json
import mimetypes
import os
from pathlib import Path
import re
import struct
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import uuid

BASE = 'https://openapi.tripo3d.ai/v3'
VIEWS = ('front', 'left', 'back', 'right')


def plan(spec, base):
    config = spec.get('tripo', {})
    images = config.get('images', [])
    if not 1 <= len(images) <= 4:
        raise ValueError('Supply 1–4 images in tripo.images')
    prepared = []
    seen = set()
    for item in images:
        view = item.get('view', 'front')
        if view not in VIEWS or view in seen:
            raise ValueError('Views must be unique front/left/back/right')
        seen.add(view)
        if bool(item.get('path')) == bool(item.get('url')):
            raise ValueError('Choose exactly one path or URL per image')
        if item.get('path'):
            path = (base / item['path']).resolve()
            if path.suffix.lower() not in ('.png', '.jpg', '.jpeg'):
                raise ValueError('Local upload supports PNG/JPEG; convert WebP first')
            data = path.read_bytes()
            if not 0 < len(data) <= 20 * 1024 * 1024:
                raise ValueError('Each image must be non-empty and at most 20 MiB')
            prepared.append({'view': view, 'path': str(path), 'sha256': sha256(data).hexdigest()})
        else:
            if urlparse(item['url']).scheme != 'https':
                raise ValueError('Use an HTTPS direct image URL')
            prepared.append({'view': view, 'url': item['url']})
    if len(prepared) > 1 and 'front' not in seen:
        raise ValueError('Multi-view needs a front view')
    model = config.get('model', 'v3.1-20260211')
    if model not in ('v3.1-20260211', 'v3.0-20250812'):
        raise ValueError('This helper is validated against H3 v3.1/v3.0 schemas')
    face_limit = config.get('faceLimit', 30000)
    if not isinstance(face_limit, int) or not 1000 <= face_limit <= 50000:
        raise ValueError('Choose 1000–50000 target faces for this web-asset helper')
    payload = {'model': model, 'texture': True, 'pbr': True, 'face_limit': face_limit,
               'orientation': 'align_image'}
    endpoint = '/generation/image-to-model' if len(prepared) == 1 else '/generation/multiview-to-model'
    if len(prepared) == 1:
        payload['input'] = prepared[0].get('url', '<uploaded-file-token>')
    else:
        payload['inputs'] = [{p['view']: p.get('url', '<uploaded-file-token>')} for p in prepared]
    result = {'productId': spec.get('productId'), 'baseUrl': BASE, 'endpoint': endpoint,
              'images': prepared, 'payload': payload, 'estimatedBaseCredits': 30,
              'pricingChecked': '2026-10-14', 'pricingNote': 'Estimate only; recheck current official pricing before paid runs'}
    fingerprint = sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()
    return result, fingerprint


def api(endpoint, key, payload=None, upload=None):
    headers = {'Authorization': f'Bearer {key}'}
    body = None
    if upload:
        path = Path(upload)
        boundary = 'flower-' + uuid.uuid4().hex
        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        # A stable safe filename avoids multipart injection from arbitrary local filenames.
        name = 'reference' + path.suffix.lower()
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
                f'Content-Type: {mime}\r\n\r\n').encode() + path.read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
        headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary
    elif payload is not None:
        body = json.dumps(payload).encode()
        headers['Content-Type'] = 'application/json'
    request = Request(BASE + endpoint, data=body, headers=headers,
                      method='POST' if body is not None else 'GET')
    with urlopen(request, timeout=30) as response:
        value = json.load(response)
    if value.get('code') != 0:
        raise RuntimeError(f"Tripo API returned error code {value.get('code')}; inspect your console")
    return value['data']


def save(path, value):
    temp = path.with_suffix('.pending')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(path)


def execute(planned, fingerprint, out, key, wait_seconds=0):
    out = Path(out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    state_path = out / 'tripo-state.json'
    if state_path.exists():
        state = json.loads(state_path.read_text(encoding='utf-8'))
        if state['fingerprint'] != fingerprint:
            raise ValueError('Input changed; use a new version directory')
        if not state.get('taskId'):
            raise RuntimeError('Submission outcome is unknown. Reconcile in Tripo console before creating another task')
    else:
        state = {'fingerprint': fingerprint, 'plan': planned, 'status': 'preparing', 'uploads': []}
        values = []
        for item in planned['images']:
            if item.get('url'):
                values.append((item['view'], item['url']))
            else:
                uploaded = api('/files', key, upload=item['path'])
                token = uploaded.get('file_token')
                if not token:
                    raise RuntimeError('Upload returned no file_token')
                state['uploads'].append({'view': item['view'], 'fileToken': token})
                values.append((item['view'], token))
        payload = dict(planned['payload'])
        if len(values) == 1:
            payload['input'] = values[0][1]
        else:
            payload['inputs'] = [{view: value} for view, value in values]
        # Persist BEFORE sending the billable POST. Never retry an ambiguous submission.
        state['status'] = 'submission-outcome-unknown'
        save(state_path, state)
        created = api(planned['endpoint'], key, payload=payload)
        task_id = created.get('task_id')
        if not task_id or not re.fullmatch(r'[A-Za-z0-9_-]+', task_id):
            raise RuntimeError('Task response has no valid task_id; reconcile in console')
        state.update(taskId=task_id, status='submitted')
        save(state_path, state)
    deadline = time.monotonic() + wait_seconds
    while True:
        task = api('/tasks/' + state['taskId'], key)
        state['status'] = task['status']
        state['lastTaskResponse'] = task
        save(state_path, state)
        if task['status'] == 'success':
            destination = out / 'tripo-original.glb'
            if not destination.exists():
                url = task.get('output', {}).get('model_url')
                if not url or urlparse(url).scheme != 'https':
                    raise RuntimeError('Success response has no HTTPS model_url; inspect receipt')
                # No API authorization header is sent to the model CDN.
                with urlopen(url, timeout=30) as response:
                    data = response.read(300 * 1024 * 1024 + 1)
                if len(data) > 300 * 1024 * 1024 or len(data) < 20:
                    raise ValueError('Model download size is invalid')
                magic, version, length = struct.unpack('<4sII', data[:12])
                if magic != b'glTF' or version != 2 or length != len(data):
                    raise ValueError('Downloaded file is not a valid GLB; preserve task receipt')
                temp = destination.with_suffix('.partial')
                temp.write_bytes(data)
                temp.replace(destination)
            state['modelFile'] = destination.name
            state['modelSha256'] = sha256(destination.read_bytes()).hexdigest()
            save(state_path, state)
            return {'taskId': state['taskId'], 'status': 'success', 'modelPath': str(destination),
                    'creditsConsumed': task.get('credits_consumed')}
        if task['status'] in ('failed', 'cancelled'):
            return {'taskId': state['taskId'], 'status': task['status'], 'retryCreated': False}
        if time.monotonic() >= deadline:
            return {'taskId': state['taskId'], 'status': task['status'], 'progress': task.get('progress'),
                    'resume': 'Run the same command/output directory again; it will query the existing task'}
        time.sleep(min(5, max(0, deadline - time.monotonic())))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spec', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--submit', action='store_true', help='Upload images and submit/resume one authorized billable task')
    parser.add_argument('--max-credits', type=int, default=30, help='Maximum estimated base credits; this is not a provider-side spending cap')
    parser.add_argument('--wait-seconds', type=int, default=0, choices=range(0, 31), metavar='0..30')
    args = parser.parse_args()
    spec_path = Path(args.spec).resolve()
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    planned, fingerprint = plan(spec, spec_path.parent)
    if not args.submit:
        print(json.dumps({'mode': 'dry-run-no-network', **planned}, ensure_ascii=False, indent=2))
        return
    if planned['estimatedBaseCredits'] > args.max_credits:
        raise ValueError('Estimated base credits exceed the supplied limit')
    if spec.get('tripo', {}).get('inputReview') != 'ready':
        raise ValueError('Input proportions/identity have not passed review; correct the references before submission')
    key = os.environ.get('TRIPO_API_KEY', '').strip()
    if not key:
        raise ValueError('TRIPO_API_KEY is not configured; store it locally, not in chat')
    print(json.dumps(execute(planned, fingerprint, args.out, key, args.wait_seconds), ensure_ascii=False))


if __name__ == '__main__':
    main()
