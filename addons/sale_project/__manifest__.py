# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': "Sales - Project",
    'summary': "Task Generation from Sales Orders",
    'description': """
Allows to create task from your sales order
=============================================
This module allows to generate a project/task from sales orders.
""",
    'category': 'Hidden',
    'depends': ['sale_management', 'sale_service', 'project_account'],
    'auto_install': ['sale_management', 'project_account'],
    'data': [
        'views/product_views.xml',
        'views/project_task_views.xml',
        'views/sale_order_line_views.xml',
        'views/sale_order_views.xml',
        'views/sale_project_portal_templates.xml',
        'views/project_update_template.xml',
        'views/project_sharing_views.xml',
        'views/project_views.xml',
        'data/sale_project_data.xml',
        'security/ir.access.csv',
    ],
    'demo': [
        'data/sale_project_demo.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'sale_project/static/src/components/project_right_side_panel/**/*',
            'sale_project/static/src/views/**/*',
        ],
        'web.assets_tests': [
            'sale_project/static/tests/tours/**/*',
        ],
        'web.assets_unit_tests': [
            'sale_project/static/tests/*',
        ],
    },
    'post_init_hook': '_set_allow_billable_in_project',
    'uninstall_hook': 'uninstall_hook',
    'license': 'LGPL-3',
}
