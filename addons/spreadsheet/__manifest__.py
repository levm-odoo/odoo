# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': "Spreadsheet",
    'version': '1.0',
    'category': 'Hidden',
    'summary': 'Spreadsheet',
    'description': 'Spreadsheet',
    'depends': ['bus', 'web', 'portal'],
    'installable': True,
    'license': 'LGPL-3',
    'data': [
        'views/public_readonly_spreadsheet_templates.xml',
    ],
    'assets': {
        'spreadsheet.dependencies': [
            'web/static/lib/Chart/Chart.js',
            'web/static/lib/chartjs-adapter-luxon/chartjs-adapter-luxon.js',
            'spreadsheet/static/lib/chartjs-chart-geo/chartjs-chart-geo.js',
        ],
        'spreadsheet.o_spreadsheet': [
            'web/static/src/views/graph/graph_model.js',
            'web/static/src/views/pivot/pivot_model.js',
            'web/static/src/polyfills/clipboard.js',
            'spreadsheet/static/src/o_spreadsheet/o_spreadsheet.js',
            'spreadsheet/static/src/**/*.js',
            # Load all o_spreadsheet templates first to allow to inherit them
            'spreadsheet/static/src/o_spreadsheet/o_spreadsheet.xml',
            'spreadsheet/static/src/**/*.xml',
            ('remove', 'spreadsheet/static/src/assets_backend/**/*'),
            ('remove', 'spreadsheet/static/src/public_readonly_app/**/*'),
        ],
        'spreadsheet.assets_print': [
            'spreadsheet/static/src/print_assets/**/*',
        ],
        'spreadsheet.public_spreadsheet': [
            ('include', 'web.assets_frontend_minimal'),
            ('include', 'web._assets_helpers'), # bootstrap variables
            'web/static/src/scss/bootstrap_overridden.scss',
            'web/static/src/scss/pre_variables.scss',
            'web/static/lib/bootstrap/scss/_variables.scss',
            'web/static/lib/bootstrap/scss/_variables-dark.scss',
            'web/static/lib/bootstrap/scss/_maps.scss',
            ('include', 'web._assets_bootstrap'),
            'web/static/lib/popper/popper.js',
            'web/static/lib/bootstrap/js/dist/util/index.js',
            'web/static/lib/bootstrap/js/dist/dom/data.js',
            'web/static/lib/bootstrap/js/dist/dom/event-handler.js',
            'web/static/lib/bootstrap/js/dist/dom/manipulator.js',
            'web/static/lib/bootstrap/js/dist/dom/selector-engine.js',
            'web/static/lib/bootstrap/js/dist/util/config.js',
            'web/static/lib/bootstrap/js/dist/base-component.js',
            'web/static/lib/bootstrap/js/dist/collapse.js',
            'web/static/lib/bootstrap/js/dist/dropdown.js',
            'web/static/src/libs/fontawesome/css/font-awesome.css',
            'web/static/lib/owl/owl.js',
            'web/static/lib/luxon/luxon.js',
            'web/static/lib/owl/odoo_module.js',
            'web/static/src/core/utils/**/*.js',
            'web/static/src/core/browser/browser.js',
            'web/static/src/core/browser/feature_detection.js',
            'web/static/src/core/registry.js',
            'web/static/src/core/assets.js',
            'web/static/src/core/templates.js',
            'web/static/src/core/template_inheritance.js',
            'web/static/src/session.js',
            'web/static/src/env.js',
            'web/static/src/core/**/*.js',
            ('remove', 'web/static/src/core/emoji_picker/emoji_data.js'),
            ('include', 'spreadsheet.dependencies'),
            'spreadsheet/static/src/o_spreadsheet/o_spreadsheet.js',
            'spreadsheet/static/src/o_spreadsheet/o_spreadsheet.xml',
            'spreadsheet/static/src/o_spreadsheet/icons.xml',
            'spreadsheet/static/src/o_spreadsheet/o_spreadsheet_extended.scss',
            'spreadsheet/static/src/o_spreadsheet/migration.js',
            'spreadsheet/static/src/helpers/odoo_functions_helpers.js',
            'spreadsheet/static/src/pivot/pivot_helpers.js',
            'spreadsheet/static/src/o_spreadsheet/odoo_module.js',
            'spreadsheet/static/src/helpers/helpers.js',
            'spreadsheet/static/src/public_readonly_app/**/*.xml',
            'spreadsheet/static/src/public_readonly_app/**/*.scss',
            'spreadsheet/static/src/public_readonly_app/**/*',
            'spreadsheet/static/src/hooks.js',
            'spreadsheet/static/src/plugins.js',
        ],
        'web.assets_backend': [
            'spreadsheet/static/src/**/*.scss',
            'spreadsheet/static/src/assets_backend/**/*',
            ('remove', 'spreadsheet/static/src/public_readonly_app/**/*.scss'),
            ('remove', 'spreadsheet/static/src/**/*.dark.scss'),
        ],
        "web.assets_web_dark": [
            'spreadsheet/static/src/**/*.dark.scss',
        ],
        'web.assets_unit_tests': [
            'spreadsheet/static/tests/**/*',
            ('include', 'spreadsheet.o_spreadsheet'),
            'spreadsheet/static/src/public_readonly_app/**/*.xml',
            'spreadsheet/static/src/public_readonly_app/**/*.js',
            ('remove', 'spreadsheet/static/src/public_readonly_app/main.js'),
        ],
    }
}
