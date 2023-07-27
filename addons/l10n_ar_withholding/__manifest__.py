# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Argentina - Payment Withholdings',
    'version': "1.0",
    'description': """
Functional
----------


Technical
---------
""",
    'author': 'ADHOC SA',
    'category': 'Accounting/Localizations',
    'depends': [
        'account',
        'l10n_ar',  # ONLY FOR CHART TEMPLATE
        'l10n_latam_check',  # ONLY FOR CHART TEMPLATE
    ],
    'data': [
        'views/account_tax_views.xml',
        'views/account_payment_view.xml',
        'views/product_template_view.xml',
        'views/report_payment_receipt_templates.xml',
        'views/res_config_settings.xml',
        'wizards/account_payment_register_views.xml',
        'security/ir.model.access.csv',
    ],
    'demo': [
        'demo/account_tax_demo.xml',
        'demo/product_product_demo.xml',
    ],
    'installable': True,
    'post_init_hook': '_l10n_ar_withholding_post_init',
    'license': 'LGPL-3',
}
