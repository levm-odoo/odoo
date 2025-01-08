{
    'name': "Sale Stock Product Expiry",
    'category': 'Sales/Sales',
    'description': 'Modifications to the forecast widget on SO lines to reflect unaltered stock in case of expiration.',
    'version': '0.1',
    'depends': ['sale_stock', 'product_expiry'],
    'installable': True,
    'auto_install': True,
    'license': 'LGPL-3',
    'data': [
        'views/sale_order_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'sale_stock_product_expiry/static/src/**/*',
        ],
    },
}
