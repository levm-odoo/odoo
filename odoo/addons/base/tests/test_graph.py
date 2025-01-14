# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

from odoo.tests.common import BaseCase
from odoo.modules.packages import PackageGraph
from odoo.modules.module import _DEFAULT_MANIFEST
from odoo.tools import mute_logger


class TestGraph(BaseCase):
    @mute_logger('odoo.modules.packages')
    def _test_graph_order(
            self,
            dependency: dict[str, list[str]],
            modules_list: list[list[str]],
            expected: list[str]
    ) -> None:
        """
        Test the order of the modules that need to be loaded

        :param dependency: A dictionary of module dependency: {module_a: [module_b, module_c]}
        :param modules_list: [['module_a', 'module_b'], ['module_c'], ...]
            module_a and module_b will be added in the first round
            module_c will be added in the second round
            ...
        :param expected: expected graph order
        """
        manifests = {
            name: {**_DEFAULT_MANIFEST.copy(), **{'depends': depends}}
            for name, depends in dependency.items()
        }
        with patch('odoo.modules.packages.PackageGraph._update_from_database'), \
                patch('odoo.modules.packages.get_manifest', lambda name: manifests.get(name, {})), \
                patch('odoo.modules.packages.PackageGraph._imported_modules', {'studio_customization'}):
            dummy_cr = None
            graph = PackageGraph(dummy_cr)

            for modules in modules_list:
                graph.add(modules)

            names = list(p.name for p in graph)
            self.assertListEqual(names, expected)

    def test_graph_order_1(self):
        dependency = {
            'base': [],
            'module1': ['base'],
            'module2': ['module1'],
            'module3': ['module1'],
            'module4': ['module2', 'module3'],
            'module5': ['module2', 'module4'],
        }
        # modules are in random order
        self._test_graph_order(
            dependency,
            [['base'], ['module3', 'module4', 'module1', 'module5', 'module2']],
            ['base', 'module1', 'module2', 'module3', 'module4', 'module5']
        )
        # module 5's depends is missing
        self._test_graph_order(
            dependency,
            [['base'], ['module1', 'module2', 'module3', 'module5']],
            ['base', 'module1', 'module2', 'module3']
        )
        # module 6's manifest is missing
        self._test_graph_order(
            dependency,
            [['base'], ['module1', 'module2', 'module3', 'module4', 'module5', 'module6']],
            ['base', 'module1', 'module2', 'module3', 'module4', 'module5']
        )
        # three adding rounds
        self._test_graph_order(
            dependency,
            [['base'], ['module1', 'module2', 'module3'], ['module4', 'module5']],
            ['base', 'module1', 'module2', 'module3', 'module4', 'module5']
        )

    def test_graph_order_2(self):
        dependency = {
            'base': [],
            'module1': ['base'],
            'module2': ['module1'],
            'module3': ['module1'],
            'module4': ['module3'],
            'module5': ['module2'],
        }
        # module4 and module5 have the same depth but don't have shared depends
        # they should be ordered by name
        self._test_graph_order(
            dependency,
            [['base'], ['module3', 'module4', 'module1', 'module5', 'module2']],
            ['base', 'module1', 'module2', 'module3', 'module4', 'module5']
        )

    def test_graph_order_3(self):
        dependency = {
            'base': [],
            'module1': ['base'],
            'module2': ['module1'],
            # depends loop
            'module3': ['module1', 'module5'],
            'module4': ['module2', 'module3'],
            'module5': ['module2', 'module4'],
        }
        self._test_graph_order(
            dependency,
            [['base'], ['module3', 'module4', 'module1', 'module5', 'module2']],
            ['base', 'module1', 'module2']
        )
