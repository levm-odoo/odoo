# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name' : 'Analytic Accounting',
    'version': '1.1',
    'category': 'Accounting/Accounting',
    'depends' : ['base', 'mail', 'uom'],
    'description': """
Module for defining analytic accounting object.
===============================================

In Odoo, analytic accounts are linked to general accounts but are treated
totally independently. So, you can enter various different analytic operations
that have no counterpart in the general financial accounts.
    """,
    'data': [
        'security/analytic_security.xml',
        'views/analytic_line_views.xml',
        'views/analytic_account_views.xml',
        'views/analytic_plan_views.xml',
        'views/analytic_distribution_model_views.xml',
        'data/analytic_data.xml',
        'security/ir.access.csv',
    ],
    'demo': [
        'data/analytic_account_demo.xml'
    ],
    'assets': {
        'web.assets_backend': [
            'analytic/static/src/components/**/*',
            'analytic/static/src/services/**/*',
        ],
        'web.assets_unit_tests': [
            'analytic/static/tests/**/*',
            ('remove', 'analytic/static/tests/analytic_distribution_tests.js'),
        ],
        'web.qunit_suite_tests': [
            'analytic/static/tests/analytic_distribution_tests.js',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
