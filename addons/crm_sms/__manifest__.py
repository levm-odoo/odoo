# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'SMS in CRM',
    'version': '1.1',
    'category': 'Sales/CRM',
    'summary': 'Add SMS capabilities to CRM',
    'depends': ['crm', 'sms'],
    'data': [
        'views/crm_lead_views.xml',
        'security/ir.access.csv',
    ],
    'installable': True,
    'auto_install': True,
    'license': 'LGPL-3',
}
