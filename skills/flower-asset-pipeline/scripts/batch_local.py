"""Run supported morphology pilots sequentially and retain per-product results."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--batch', required=True)
    parser.add_argument('--blender', required=True)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    batch_path = Path(args.batch).resolve()
    results = []
    for job in json.loads(batch_path.read_text(encoding='utf-8'))['jobs']:
        spec_path = (batch_path.parent / job['spec']).resolve()
        out = (batch_path.parent / job['out']).resolve()
        spec = json.loads(spec_path.read_text(encoding='utf-8'))
        builders = {'gerbera': 'build_gerbera.py', **{name: 'build_botanical.py' for name in
                    ['rose', 'carnation', 'lily', 'lily-of-valley', 'gypsophila', 'eucalyptus', 'craspedia', 'lisianthus']}}
        if spec.get('archetype') not in builders:
            results.append({'productId': spec.get('productId'), 'status': 'needs-morphology-specific-builder'})
            continue
        command = [args.blender, '--background', '--python', str(Path(__file__).parent / builders[spec['archetype']]),
                   '--', '--spec', str(spec_path), '--out', str(out), '--samples', str(job.get('samples', 12))]
        if args.dry_run:
            results.append({'productId': spec.get('productId'), 'status': 'dry-run', 'command': command})
            continue
        manifest_path = out / 'manifest.json'
        if manifest_path.is_file():
            existing = json.loads(manifest_path.read_text(encoding='utf-8'))
            matches = existing.get('sourceSpec', {}).get('inputSpecSha256') == sha256(spec_path.read_bytes()).hexdigest()
            complete = all((out / file).is_file() for file in existing.get('files', []))
            status = 'existing-candidate' if matches and complete and existing.get('checks', {}).get('roundTrip') else 'version-conflict-use-new-output'
            results.append({'productId': spec.get('productId'), 'status': status, 'out': str(out)})
            continue
        if out.exists() and any(out.iterdir()):
            results.append({'productId': spec.get('productId'), 'status': 'incomplete-version-use-new-output', 'out': str(out)})
            continue
        out.mkdir(parents=True, exist_ok=True)
        with (out / 'build.log').open('w', encoding='utf-8') as log:
            process = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=False)
        # Blender can exit 0 after a script exception; require the manifest and its files.
        success = process.returncode == 0 and manifest_path.is_file()
        if success:
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
            success = bool(manifest.get('checks', {}).get('roundTrip')) and all(
                (out / file).is_file() for file in manifest.get('files', []))
        results.append({'productId': spec.get('productId'), 'status': 'generated-needs-visual-review' if success else 'failed', 'out': str(out)})
    if not args.dry_run:
        batch_path.with_name(batch_path.stem + '-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
