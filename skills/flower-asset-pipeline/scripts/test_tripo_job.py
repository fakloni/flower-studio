"""Offline behavioral tests; no provider requests or costs."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import tripo_job


class ResumableTaskTests(unittest.TestCase):
    def spec(self):
        return {'productId': 'P072', 'tripo': {'images': [
            {'view': 'front', 'url': 'https://example.com/front.png'},
            {'view': 'back', 'url': 'https://example.com/back.png'}]}}

    def test_multiview_preserves_view_assignment(self):
        planned, _ = tripo_job.plan(self.spec(), Path('.'))
        self.assertEqual(planned['payload']['inputs'], [
            {'front': 'https://example.com/front.png'}, {'back': 'https://example.com/back.png'}])

    def test_missing_front_is_rejected(self):
        spec = self.spec()
        spec['tripo']['images'][0]['view'] = 'left'
        with self.assertRaises(ValueError):
            tripo_job.plan(spec, Path('.'))

    def test_resume_does_not_create_second_task(self):
        planned, fingerprint = tripo_job.plan(self.spec(), Path('.'))
        with tempfile.TemporaryDirectory() as temp:
            calls = []
            def fake(endpoint, key, payload=None, upload=None):
                calls.append(endpoint)
                if payload is not None:
                    return {'task_id': 'task_one'}
                return {'status': 'running', 'progress': 40}
            with patch.object(tripo_job, 'api', side_effect=fake):
                tripo_job.execute(planned, fingerprint, temp, 'fake-test-key')
                tripo_job.execute(planned, fingerprint, temp, 'fake-test-key')
            self.assertEqual(calls.count(planned['endpoint']), 1)
            self.assertEqual(calls.count('/tasks/task_one'), 2)
            self.assertNotIn('fake-test-key', (Path(temp) / 'tripo-state.json').read_text())

    def test_ambiguous_submission_blocks_resubmission(self):
        planned, fingerprint = tripo_job.plan(self.spec(), Path('.'))
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(tripo_job, 'api', side_effect=TimeoutError):
                with self.assertRaises(TimeoutError):
                    tripo_job.execute(planned, fingerprint, temp, 'fake-test-key')
            with patch.object(tripo_job, 'api') as api:
                with self.assertRaises(RuntimeError):
                    tripo_job.execute(planned, fingerprint, temp, 'fake-test-key')
                api.assert_not_called()

    def test_failed_task_does_not_regenerate(self):
        planned, fingerprint = tripo_job.plan(self.spec(), Path('.'))
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(tripo_job, 'api', side_effect=[{'task_id': 'task_one'}, {'status': 'failed'}]):
                result = tripo_job.execute(planned, fingerprint, temp, 'fake-test-key')
            self.assertEqual(result['status'], 'failed')
            self.assertFalse(result['retryCreated'])

    def test_changed_input_blocks_reuse(self):
        planned, fingerprint = tripo_job.plan(self.spec(), Path('.'))
        with tempfile.TemporaryDirectory() as temp:
            tripo_job.save(Path(temp) / 'tripo-state.json', {'fingerprint': fingerprint, 'taskId': 'task_one'})
            with patch.object(tripo_job, 'api') as api:
                with self.assertRaises(ValueError):
                    tripo_job.execute(planned, 'different', temp, 'fake-test-key')
                api.assert_not_called()

    def test_cli_blocks_unreviewed_input_before_network(self):
        with tempfile.TemporaryDirectory() as temp:
            spec = Path(temp) / 'spec.json'
            value = self.spec()
            value['tripo']['inputReview'] = 'blocked-proportion'
            spec.write_text(json.dumps(value), encoding='utf-8')
            with patch('sys.argv', ['tripo_job.py', '--spec', str(spec), '--out', temp, '--submit']), \
                 patch.dict(os.environ, {'TRIPO_API_KEY': 'fake-test-key'}), \
                 patch.object(tripo_job, 'api') as api:
                with self.assertRaises(ValueError):
                    tripo_job.main()
                api.assert_not_called()


if __name__ == '__main__':
    unittest.main()
