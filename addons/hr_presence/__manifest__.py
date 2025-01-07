# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Employee Presence Control',
    'version': '1.0',
    'category': 'Human Resources',
    'description': """
Control Employees Presence
==========================

Based on:
    * The IP Address
    * The User's Session
    * The Sent Emails

Allows to contact directly the employee in case of unjustified absence.
    """,
    'depends': ['hr', 'hr_holidays', 'sms'],
    'data': [
        'views/hr_employee_views.xml',
        'data/mail_template_data.xml',
        'data/sms_data.xml',
        'data/ir_cron.xml',
        'security/ir.access.csv',
    ],
    'installable': True,
    'license': 'LGPL-3',
     'assets': {
        'web.assets_backend': [
            'hr_presence/static/src/**/*',
        ],
    }
}
