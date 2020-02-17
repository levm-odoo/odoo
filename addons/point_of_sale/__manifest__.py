# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Point of Sale',
    'version': '1.0.1',
    'category': 'Sales/Point of Sale',
    'sequence': 20,
    'summary': 'User-friendly PoS interface for shops and restaurants',
    'description': "",
    'depends': ['stock_account', 'barcodes', 'web_editor', 'digest'],
    'data': [
        'security/point_of_sale_security.xml',
        'security/ir.model.access.csv',
        'data/default_barcode_patterns.xml',
        'data/digest_data.xml',
        'wizard/pos_box.xml',
        'wizard/pos_details.xml',
        'wizard/pos_payment.xml',
        'views/pos_templates.xml',
        'views/point_of_sale_template.xml',
        'views/point_of_sale_report.xml',
        'views/point_of_sale_view.xml',
        'views/pos_order_view.xml',
        'views/pos_category_view.xml',
        'views/product_view.xml',
        'views/account_journal_view.xml',
        'views/pos_payment_method_views.xml',
        'views/pos_payment_views.xml',
        'views/pos_config_view.xml',
        'views/pos_session_view.xml',
        'views/point_of_sale_sequence.xml',
        'views/point_of_sale.xml',
        'data/point_of_sale_data.xml',
        'views/pos_order_report_view.xml',
        'views/account_statement_view.xml',
        'views/res_config_settings_views.xml',
        'views/digest_views.xml',
        'views/res_partner_view.xml',
        'views/report_userlabel.xml',
        'views/report_saledetails.xml',
        'views/point_of_sale_dashboard.xml',
    ],
    'demo': [
        'data/point_of_sale_demo.xml',
    ],
    'installable': True,
    'application': True,
    'qweb': [
        'static/src/xml/pos.xml',
        'static/src/xml/ProductScreen.xml',
        'static/src/xml/ClientLine.xml',
        'static/src/xml/ClientDetails.xml',
        'static/src/xml/ClientDetailsEdit.xml',
        'static/src/xml/ClientListScreen.xml',
        'static/src/xml/PSNumpadInputButton.xml',
        'static/src/xml/PaymentScreenNumpad.xml',
        'static/src/xml/PaymentScreenElectronicPayment.xml',
        'static/src/xml/PaymentScreenPaymentLines.xml',
        'static/src/xml/PaymentMethodButton.xml',
        'static/src/xml/PaymentScreen.xml',
        'static/src/xml/Orderline.xml',
        'static/src/xml/OrderSummary.xml',
        'static/src/xml/OrderWidget.xml',
        'static/src/xml/NumpadWidget.xml',
        'static/src/xml/ActionpadWidget.xml',
        'static/src/xml/CategoryBreadcrumb.xml',
        'static/src/xml/CategoryButton.xml',
        'static/src/xml/CategorySimpleButton.xml',
        'static/src/xml/HomeCategoryBreadcrumb.xml',
        'static/src/xml/ProductsWidgetControlPanel.xml',
        'static/src/xml/ProductDisplay.xml',
        'static/src/xml/ProductsList.xml',
        'static/src/xml/ProductsWidget.xml',
        'static/src/xml/WrappedProductNameLines.xml',
        'static/src/xml/OrderReceipt.xml',
        'static/src/xml/ReceiptScreen.xml',
        'static/src/xml/OrderSelector.xml',
        'static/src/xml/CashierName.xml',
        'static/src/xml/ProxyStatus.xml',
        'static/src/xml/SyncNotification.xml',
        'static/src/xml/HeaderButton.xml',
        'static/src/xml/Draggable.xml',
        'static/src/xml/DraggablePart.xml',
        'static/src/xml/DebugWidget.xml',
        'static/src/xml/ErrorPopup.xml',
        'static/src/xml/ConfirmPopup.xml',
        'static/src/xml/TextInputPopup.xml',
        'static/src/xml/ErrorTracebackPopup.xml',
        'static/src/xml/EditListInput.xml',
        'static/src/xml/EditListPopup.xml',
    ],
    'website': 'https://www.odoo.com/page/point-of-sale-shop',
}
