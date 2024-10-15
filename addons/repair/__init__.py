# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from .models import (
    ProductProduct, ProductTemplate, RepairOrder, RepairTags, SaleOrder,
    SaleOrderLine, StockLot, StockMove, StockMoveLine, StockPicking, StockPickingType,
    StockTraceabilityReport, StockWarehouse,
)
from .wizard import StockWarnInsufficientQtyRepair
from .report import StockForecasted_Product_Product

from odoo import api, SUPERUSER_ID

def _create_warehouse_data(env):
    """ This hook is used to add default repair picking types on every warehouse.
    It is necessary if the repair module is installed after some warehouses were already created.
    """
    warehouses = env['stock.warehouse'].search([('repair_type_id', '=', False)])
    for warehouse in warehouses:
        picking_type_vals = warehouse._create_or_update_sequences_and_picking_types()
        if picking_type_vals:
            warehouse.write(picking_type_vals)
