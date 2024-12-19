# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Payment Provider: Paymob',
    'version': '2.0',
    'category': 'Accounting/Payment Providers',
    'sequence': 350,
    'summary': "An Egyptian payment provider for online payments for the middle east.",
    'description': " ",  # Non-empty string to avoid loading the README file.
    'depends': ['payment'],
    'data': [
        'views/payment_paymob_templates.xml',
        'views/payment_provider_views.xml',

        'data/payment_provider_data.xml',

        # Security.
        'security/ir.model.access.csv',
    ],
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
    'assets': {
        'web.assets_frontend': [
            'payment_paymob/static/src/**/*',
        ],
    },
    'license': 'LGPL-3',
}
