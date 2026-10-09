"""Offline chart checks; no SwanLab run or network upload is created."""
import importlib.util
import json
import io
import os
import sys
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
import unittest
import swanlab

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('dmc_swanlab', ROOT / 'scripts/dmc-swanlab.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FakeSDK:
    echarts = swanlab.echarts

    def __init__(self):
        self.logs = []

    def log(self, data, step=None):
        self.logs.append((step, data))

    def finish(self, state):
        self.state = state


class ChartsTest(unittest.TestCase):
    def setUp(self):
        self.tracker = module.Tracker.__new__(module.Tracker)
        self.tracker.sdk = FakeSDK()
        self.tracker.baseline = json.loads(module.BASELINE_PATH.read_text())
        self.tracker.comparison_series = {}
        self.tracker.last_step = self.tracker.last_chart_step = 0
        self.tracker.chart_every = 25
        self.tracker.games = self.tracker.samples = self.tracker.seconds = 0
        self.tracker.best_version = 0
        self.tracker.hierarchical = False

    def record(self, step):
        self.tracker.record({
            'iteration': step, 'version': step, 'rounds': 1, 'samples': 100,
            'roundMetrics': {'playerRounds': 2, 'goodsSold': 77, 'scoreSum': 140,
                'actionCounts': {'take_goods': 34, 'take_camels': 15,
                    'trade': 20, 'sell_actions': 31}},
        })

    def test_first_batch_has_all_four_expert_reference_lines(self):
        self.record(1)
        _, charts = self.tracker.sdk.logs[-1]
        for category in module.ROUND_CATEGORIES:
            name = module.ACTION_CHART_NAMES[category + '_share']
            options = json.loads(charts['human1600_comparison/' + name].dump_options())
            ai, human = options['series']
            self.assertEqual(human['name'], 'Human Elo 1600+')
            self.assertEqual(human['lineStyle']['type'], 'dashed')
            self.assertAlmostEqual(human['data'][0][1],
                                   self.tracker.baseline['action_share'][category])
            self.assertEqual(len(ai['data']), len(human['data']))

    def test_refresh_cadence_and_final_flush(self):
        self.record(1)
        self.record(2)
        self.assertEqual(self.tracker.last_chart_step, 1)
        self.record(25)
        self.assertEqual(self.tracker.last_chart_step, 25)
        self.record(26)
        self.tracker.finish()
        self.assertEqual(self.tracker.last_chart_step, 26)
        self.assertEqual(self.tracker.sdk.state, 'success')

    def test_heartbeat_does_not_write_training_metrics(self):
        self.record(50)
        self.tracker.heartbeat()
        step, metrics = self.tracker.sdk.logs[-1]
        self.assertIsNone(step)
        self.assertEqual(metrics['monitor/last_training_iteration'], 50)
        self.assertTrue(all(key.startswith('monitor/') for key in metrics))
        self.assertEqual(self.tracker.last_step, 50)

    def test_resume_uses_original_project_and_id(self):
        options = {}
        fake = SimpleNamespace(
            login=lambda **kw: None,
            init=lambda **kw: options.update(kw) or SimpleNamespace(
                id='a0d0bbub', url='https://swanlab.cn/@franzyu/jaipur-dmc/runs/a0d0bbub'),
            Settings=lambda **kw: kw, define_metric=lambda *args, **kw: None,
        )
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'config.json').write_text('{}')
            Path(directory, 'swanlab-run.json').write_text(json.dumps({
                'project': 'jaipur-dmc',
                'url': 'https://swanlab.cn/@franzyu/jaipur-dmc/runs/a0d0bbub',
            }))
            with patch.dict(sys.modules, {'swanlab': fake}), patch.dict(os.environ, {
                'SWANLAB_API_KEY': 'fake-for-test', 'SWANLAB_MODE': 'online',
                'JAIPUR_SWANLAB_PROJECT': 'different-new-project',
            }):
                tracker = module.Tracker(directory, resume=True)
            self.assertEqual(options['project'], 'jaipur-dmc')
            self.assertEqual(options['id'], 'a0d0bbub')
            self.assertEqual(options['resume'], 'must')
            self.assertEqual(tracker.info['id'], 'a0d0bbub')

    def test_partial_live_line_waits_until_completed(self):
        source = io.StringIO('{"iteration":1}\n{"iteration":')
        self.assertEqual(module.read_complete_row(source, follow=True), {'iteration': 1})
        offset = source.tell()
        self.assertIsNone(module.read_complete_row(source, follow=True))
        self.assertEqual(source.tell(), offset)
        source.seek(0, io.SEEK_END)
        source.write('2}\n')
        source.seek(offset)
        self.assertEqual(module.read_complete_row(source, follow=True), {'iteration': 2})


if __name__ == '__main__':
    unittest.main()
