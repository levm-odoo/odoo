# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Saudi Arabia - Accounting',
    'icon': '/account/static/description/l10n.png',
    'countries': ['sa'],
    'version': '2.0',
    'author': 'Odoo S.A., DVIT.ME (http://www.dvit.me)',
    'category': 'Accounting/Localizations/Account Charts',
    'description': """
Odoo Arabic localization for most Saudi Arabia.
""",
    'website': 'https://www.odoo.com/documentation/17.0/applications/finance/fiscal_localizations/saudi_arabia.html',
    'depends': [
        'l10n_gcc_invoice',
        'account',
    ],
    'data': [
        'data/account_data.xml',
        'data/account_tax_report_data.xml',
<<<<<<< 17.0
||||||| 062cc7fc71324253f7f6fc5c8aa10561cf13400f
        'data/account_tax_template_data.xml',
        'data/account_fiscal_position_template_data.xml',
        'data/account_chart_template_configure_data.xml',
        'views/view_move_form.xml',
=======
        'data/account_tax_template_data.xml',
        'data/account_fiscal_position_template_data.xml',
        'data/account_chart_template_configure_data.xml',
        'data/report_paperformat_data.xml',
        'views/view_move_form.xml',
>>>>>>> b18537e7d43e5675d4dc20b431ce9ed9cbd01414
        'views/report_invoice.xml',
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'license': 'LGPL-3',
}
