# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Sales Teams',
    'version': '1.1',
    'category': 'Sales/Sales',
    'summary': 'Sales Teams',
    'description': """
Using this application you can manage Sales Teams with CRM and/or Sales
=======================================================================
 """,
    'website': 'https://www.odoo.com/app/crm',
    'depends': ['base', 'mail'],
    'data': [
        'security/sales_team_security.xml',
        'data/crm_team_data.xml',
        'views/crm_tag_views.xml',
        'views/crm_team_views.xml',
        'views/crm_team_member_views.xml',
        'views/mail_activity_views.xml',
        'security/ir.access.csv',
        ],
    'demo': [
        'data/crm_team_demo.xml',
        'data/crm_tag_demo.xml',
    ],
    'installable': True,
    'assets': {
        'web.assets_backend': [
            'sales_team/static/src/**/*',
        ],
        'web.assets_unit_tests': [
            'sales_team/static/tests/**/*',
        ],
    },
    'license': 'LGPL-3',
}
