# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.


{
    'name': 'Manufacturing',
    'version': '2.0',
    'website': 'https://www.odoo.com/page/manufacturing',
    'category': 'Manufacturing/Manufacturing',
    'sequence': 55,
    'summary': 'Manufacturing Orders & BOMs',
    'depends': ['product', 'stock', 'resource'],
    'description': "",
    'data': [
        'security/mrp_security.xml',
        'security/ir.model.access.csv',
        'data/digest_data.xml',
        'data/mail_templates.xml',
        'data/mrp_data.xml',
        'wizard/change_production_qty_views.xml',
        'wizard/mrp_workcenter_block_view.xml',
        'wizard/stock_warn_insufficient_qty_views.xml',
        'wizard/mrp_production_backorder.xml',
        'wizard/mrp_consumption_warning_views.xml',
        'wizard/mrp_immediate_production_views.xml',
        'views/mrp_views_menus.xml',
        'views/stock_move_views.xml',
        'views/mrp_workorder_views.xml',
        'views/mrp_workcenter_views.xml',
        'views/mrp_bom_views.xml',
        'views/mrp_production_views.xml',
        'views/mrp_routing_views.xml',
        'views/product_views.xml',
        'views/stock_orderpoint_views.xml',
        'views/stock_warehouse_views.xml',
        'views/stock_picking_views.xml',
        'views/mrp_unbuild_views.xml',
        'views/ir_attachment_view.xml',
        'views/res_config_settings_views.xml',
        'views/stock_scrap_views.xml',
        'report/report_deliveryslip.xml',
        'report/mrp_report_views_main.xml',
        'report/mrp_report_bom_structure.xml',
        'report/mrp_production_templates.xml',
        'report/report_stock_forecasted.xml',
        'report/report_stock_rule.xml',
        'report/mrp_zebra_production_templates.xml',
    ],
    'demo': [
        'data/mrp_demo.xml',
    ],
    'test': [],
    'application': True,
    'pre_init_hook': '_pre_init_mrp',
    'post_init_hook': '_create_warehouse_data',
    'uninstall_hook': 'uninstall_hook',
    'assets': {
        'web.assets_backend': [
            # inside .
            'mrp/static/src/scss/mrp_workorder_kanban.scss',
            # inside .
            'mrp/static/src/js/mrp.js',
            # inside .
            'mrp/static/src/js/mrp_bom_report.js',
            # inside .
            'mrp/static/src/js/mrp_workorder_popover.js',
            # inside .
            'mrp/static/src/js/mrp_documents_controller_mixin.js',
            # inside .
            'mrp/static/src/js/mrp_documents_document_viewer.js',
            # inside .
            'mrp/static/src/js/mrp_documents_kanban_controller.js',
            # inside .
            'mrp/static/src/js/mrp_documents_kanban_record.js',
            # inside .
            'mrp/static/src/js/mrp_documents_kanban_renderer.js',
            # inside .
            'mrp/static/src/js/mrp_document_kanban_view.js',
            # inside .
            'mrp/static/src/js/mrp_should_consume.js',
        ],
        'web.assets_common': [
            # inside .
            'mrp/static/src/scss/mrp_bom_report.scss',
            # inside .
            'mrp/static/src/scss/mrp_fields.scss',
            # inside .
            'mrp/static/src/scss/mrp_gantt.scss',
            # inside .
            'mrp/static/src/scss/mrp_document_kanban_view.scss',
        ],
        'web.qunit_suite_tests': [
            # after //script[last()]
            'mrp/static/tests/mrp_tests.js',
            # after //script[last()]
            'mrp/static/tests/mrp_document_kanban_tests.js',
        ],
        'web.assets_qweb': [
            'mrp/static/src/xml/*.xml',
        ],
    }
}
