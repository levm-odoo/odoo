# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': "Shopper's Wishlist",
    'summary': 'Allow shoppers to enlist products',
    'description': """
Allow shoppers of your eCommerce store to create personalized collections of products they want to buy and save them for future reference.
    """,
    'category': 'Website/Website',
    'version': '1.0',
    'depends': ['website_sale'],
    'data': [
        'security/website_sale_wishlist_security.xml',
        'security/ir.model.access.csv',
        'views/website_sale_wishlist_template.xml',
        'views/snippets.xml',
    ],
    'installable': True,
    'assets': {
        'web.assets_frontend': [
            'website_sale_wishlist/static/src/js/website_sale_wishlist.js',
            'website_sale_wishlist/static/src/js/website_sale.js',
            'website_sale_wishlist/static/src/scss/website_sale_wishlist.scss',
        ],
        'web.assets_tests': [
            'website_sale_wishlist/static/tests/**/*',
        ],
    },
    'license': 'LGPL-3',
}
