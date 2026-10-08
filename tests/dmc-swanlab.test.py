"""Offline chart checks; no SwanLab run or network upload is created."""
import importlib.util
import json
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

    def log(self, data, step):
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


if __name__ == '__main__':
    unittest.main()
