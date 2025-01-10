# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': 'Members',
    'version': '1.0',
    'category': 'Sales/Sales',
    'description': """
    
    Todo


    """,
    'depends': ['crm', 'sale'],
    'data': [
        'security/ir.model.access.csv',
        # 'wizard/membership_invoice_views.xml',
        # 'data/membership_data.xml',
        'data/res_partner_grade_data.xml',
        # 'views/product_views.xml',
        # 'views/partner_views.xml',
        'views/res_partner.xml',
        'views/res_parter_grade_views.xml',
        'views/product_template.xml',
        # 'report/report_membership_views.xml',
    ],
    'website': 'https://www.odoo.com/app/forum',  #TODO
    'license': 'LGPL-3',
}
