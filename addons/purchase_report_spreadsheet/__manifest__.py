# -*- coding: utf-8 -*-
{
    'name': "purchase_report_spreadsheet",
    'summary': """
        Short (1 phrase/line) summary of the module's purpose, used as
        subtitle on modules listing or apps.openerp.com""",
    'description': """
        Long description of module's purpose
    """,
    'author': "My Company",
    'website': "http://www.yourcompany.com",
    'category': 'Uncategorized',
    'version': '0.1',
    'depends': ['purchase'],
    'data': [
        'data/cron.xml',
        'data/email.xml',
    ],
    'demo': [
    ],
}
