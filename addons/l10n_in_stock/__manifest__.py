# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Indian - Stock Report(GST)',
    'version': '1.0',
    'description': """GST Stock Report""",
    'category': 'Accounting',
    'depends': [
        'l10n_in',
        'stock',
    ],
    'data': [
        'views/report_templates.xml',
        'views/report_stockpicking_operations.xml',
        'views/stock_warehouse_views.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': True,
}
