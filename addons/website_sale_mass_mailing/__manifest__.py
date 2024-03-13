# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': "Checkout Newsletter",
    'summary': "Let new customers sign up for a newsletter during checkout",
    'description': """
        Allows anonymous shoppers of your ecommerce to sign up for a newsletter during checkout
        process.
    """,
    'category': 'Website/Website',
    'version': '1.0',
    'depends': ['website_sale', 'website_mass_mailing'],
    'data': [
        'views/templates.xml',
        'views/res_config_settings_views.xml'
    ],
    'auto_install': True,
    'license': 'LGPL-3',
}
