# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Rwanda - Accounting',
    'icon': '/account/static/description/l10n.png',
    'countries': ['RW'],
    'category': 'Accounting/Localizations/Account Charts',
    'version': '1.0',
    'depends': [
        'account',
    ],
    'auto_install': ['account'],
    'description': """
    Rwandan localisation containing:
    - COA
    - Taxes
    - Tax report
    - Fiscal position
    """,
    'data': [
        'data/l10n_rw_chart_data.xml',
        'data/account_tax_report_data.xml',
        'views/account_tax_views.xml',
        'security/ir.model.access.csv',
    ],
    'demo': [
        'demo/demo_company.xml',
    ],
    'license': 'LGPL-3',
}
