# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'On site Payment & Picking',
    'version': '1.0',
    'category': 'Website/Website',
    'description': """
Allows customers to pay for their orders at a shop, instead of paying online.
""",
    'depends': ['website_sale', 'stock', 'payment_custom'],
    'data': [
        'data/payment_method_data.xml',
        'data/payment_provider_data.xml',  # Depends on `payment_method_pay_on_site`.
        'data/website_sale_picking_data.xml',

        'views/res_config_settings_views.xml',
        'views/templates.xml',
        'views/delivery_view.xml'
    ],
    'demo': [
        'data/demo.xml',
    ],
    'uninstall_hook': 'uninstall_hook',
    'assets': {
        'web.assets_frontend': [
            'website_sale_picking/static/src/js/payment_button.js',
            'website_sale_picking/static/src/js/payment_form.js'
        ],
        'web.assets_tests': [
            'website_sale_picking/static/tests/tours/**/*.js'
        ]
    },
    'license': 'LGPL-3',
}
