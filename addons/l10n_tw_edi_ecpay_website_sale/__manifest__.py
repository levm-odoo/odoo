{
    "name": "Taiwan - E-invoicing Ecommerce",
    "countries": ["tw"],
    "version": "1.0",
    "category": "Website Sale/Localizations/EDI",
    "summary": """ECpay E-invoice bridge module for Ecommerce""",
    "description": """
        This bridge module allows the user to input Ecpay information in ecommerce for sending their invoices to the Ecpay system
    """,
    "website": "https://www.odoo.com",
    "license": "LGPL-3",
    "depends": [
        "website_sale",
        "l10n_tw_edi_ecpay",
    ],
    "data": [
        "views/sale_order_view.xml",
        "views/payment_form.xml"
    ],
    "assets": {
        "web.assets_frontend": [
            "l10n_tw_edi_ecpay_website_sale/static/src/**/*"
        ]
    },
    "installable": True,
}
