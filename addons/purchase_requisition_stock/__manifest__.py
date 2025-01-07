# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Purchase Requisition Stock',
    'version': '1.2',
    'category': 'Inventory/Purchase',
    'sequence': 70,
    'depends': ['purchase_requisition', 'purchase_stock'],
    'data': [
        'data/purchase_requisition_stock_data.xml',
        'views/purchase_views.xml',
        'views/purchase_requisition_views.xml',
        'security/ir.access.csv',
    ],
    'installable': True,
    'auto_install': True,
    'license': 'LGPL-3',
}
