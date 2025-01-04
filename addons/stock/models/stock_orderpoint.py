# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
from pytz import timezone, UTC
from collections import defaultdict
from datetime import datetime, time
from dateutil import relativedelta
from psycopg2 import OperationalError

from odoo import SUPERUSER_ID, _, api, fields, models
from odoo.addons.stock.models.stock_rule import ProcurementException
from odoo.exceptions import RedirectWarning, UserError, ValidationError
from odoo.modules.registry import Registry
from odoo.osv import expression
from odoo.sql_db import BaseCursor
from odoo.tools import float_compare, float_is_zero, frozendict, split_every, format_date

_logger = logging.getLogger(__name__)


class StockWarehouseOrderpoint(models.Model):
    """ Defines Minimum stock rules. """
    _name = 'stock.warehouse.orderpoint'
    _description = "Minimum Inventory Rule"
    _check_company_auto = True
    _order = "location_id,company_id,id"

    name = fields.Char(
        'Name', copy=False, required=True, readonly=True,
        default=lambda self: self.env['ir.sequence'].next_by_code('stock.orderpoint'))
    trigger = fields.Selection([
        ('auto', 'Auto'), ('manual', 'Manual')], string='Trigger', default='auto', required=True)
    active = fields.Boolean(
        'Active', default=True,
        help="If the active field is set to False, it will allow you to hide the orderpoint without removing it.")
    snoozed_until = fields.Date('Snoozed', help="Hidden until next scheduler.")
    warehouse_id = fields.Many2one(
        'stock.warehouse', 'Warehouse',
        compute="_compute_warehouse_id", store=True, readonly=False, precompute=True,
        check_company=True, ondelete="cascade", required=True)
    location_id = fields.Many2one(
        'stock.location', 'Location', index=True,
        compute="_compute_location_id", store=True, readonly=False, precompute=True,
        ondelete="cascade", required=True, check_company=True)
    product_tmpl_id = fields.Many2one('product.template', related='product_id.product_tmpl_id')
    product_id = fields.Many2one(
        'product.product', 'Product',
        domain=("[('product_tmpl_id', '=', context.get('active_id', False))] if context.get('active_model') == 'product.template' else"
            " [('id', '=', context.get('default_product_id', False))] if context.get('default_product_id') else"
            " [('is_storable', '=', True)]"),
        ondelete='cascade', required=True, check_company=True)
    product_category_id = fields.Many2one('product.category', name='Product Category', related='product_id.categ_id')
    product_uom = fields.Many2one(
        'uom.uom', 'Unit of Measure', related='product_id.uom_id')
    product_uom_name = fields.Char(string='Product unit of measure label', related='product_uom.display_name', readonly=True)
    product_min_qty = fields.Float(
        'Min Quantity', digits='Product Unit of Measure', required=True, default=0.0,
        compute='_compute_product_min_qty', readonly=False, store=True,
        help="When the virtual stock goes below the Min Quantity specified for this field, Odoo generates "
             "a procurement to bring the forecasted quantity above of this Min Quantity.")
    product_max_qty = fields.Float(
        'Max Quantity', digits='Product Unit of Measure', required=True, default=0.0,
        compute='_compute_product_max_qty', readonly=False, store=True,
        help="When the virtual stock goes below the Min Quantity, Odoo generates "
             "a procurement to bring the forecasted quantity up to (or near to) the Max Quantity specified for this field (or to Min Quantity, whichever is bigger).")
    qty_multiple = fields.Float(
        'Multiple Quantity', digits='Product Unit of Measure',
        default=1, required=True,
        help="The procurement quantity will be rounded up to a multiple of this field quantity. If it is 0, it is not rounded.")
    group_id = fields.Many2one(
        'procurement.group', 'Procurement Group', copy=False,
        help="Moves created through this orderpoint will be put in this procurement group. If none is given, the moves generated by stock rules will be grouped into one big picking.")
    company_id = fields.Many2one(
        'res.company', 'Company', required=True, index=True,
        default=lambda self: self.env.company)
    allowed_location_ids = fields.One2many(comodel_name='stock.location', compute='_compute_allowed_location_ids')

    rule_ids = fields.Many2many('stock.rule', string='Rules used', compute='_compute_rules')
    lead_days_date = fields.Date(compute='_compute_lead_days')
    route_id = fields.Many2one(
        'stock.route', string='Route', domain="[('product_selectable', '=', True)]")
    qty_on_hand = fields.Float('On Hand', readonly=True, compute='_compute_qty', digits='Product Unit of Measure')
    qty_forecast = fields.Float('Forecast', readonly=True, compute='_compute_qty', digits='Product Unit of Measure')
    qty_to_order = fields.Float('To Order', compute='_compute_qty_to_order', inverse='_inverse_qty_to_order', search='_search_qty_to_order', digits='Product Unit of Measure')
    qty_to_order_computed = fields.Float('To Order Computed', compute='_compute_qty_to_order_computed', digits='Product Unit of Measure')
    qty_to_order_manual = fields.Float('To Order Manual', digits='Product Unit of Measure')

    days_to_order = fields.Float(compute='_compute_days_to_order', help="Numbers of days  in advance that replenishments demands are created.")
    visibility_days = fields.Float(
        compute='_compute_visibility_days', inverse='_set_visibility_days', readonly=False,
        help="Consider product forecast these many days in the future upon product replenishment, set to 0 for just-in-time.\n"
             "The value depends on the type of the route (Buy or Manufacture)")

    unwanted_replenish = fields.Boolean('Unwanted Replenish', compute="_compute_unwanted_replenish")

    _qty_multiple_check = models.Constraint(
        'CHECK( qty_multiple >= 0 )',
        'Qty Multiple must be greater than or equal to zero.',
    )
    _product_location_check = models.Constraint(
        'unique (product_id, location_id, company_id)',
        'A replenishment rule already exists for this product on this location.',
    )

    @api.depends('warehouse_id')
    def _compute_allowed_location_ids(self):
        # We want to keep only the locations
        #  - strictly belonging to our warehouse
        #  - not belonging to any warehouses
        for orderpoint in self:
            loc_domain = [('usage', 'in', ('internal', 'view'))]
            other_warehouses = self.env['stock.warehouse'].search([('id', '!=', orderpoint.warehouse_id.id)])
            for view_location_id in other_warehouses.mapped('view_location_id'):
                loc_domain = expression.AND([loc_domain, ['!', ('id', 'child_of', view_location_id.id)]])
                loc_domain = expression.AND([loc_domain, ['|', ('company_id', '=', False), ('company_id', '=', orderpoint.company_id.id)]])
            orderpoint.allowed_location_ids = self.env['stock.location'].search(loc_domain)

    @api.depends('rule_ids', 'product_id.seller_ids', 'product_id.seller_ids.delay')
    def _compute_lead_days(self):
        orderpoints_to_compute = self.filtered(lambda orderpoint: orderpoint.product_id and orderpoint.location_id)
        for orderpoint in orderpoints_to_compute.with_context(bypass_delay_description=True):
            values = orderpoint._get_lead_days_values()
            lead_days, dummy = orderpoint.rule_ids._get_lead_days(orderpoint.product_id, **values)
            lead_days_date = fields.Date.today() + relativedelta.relativedelta(days=lead_days['total_delay'])
            orderpoint.lead_days_date = lead_days_date
        (self - orderpoints_to_compute).lead_days_date = False

    @api.depends('route_id', 'product_id', 'location_id', 'company_id', 'warehouse_id', 'product_id.route_ids')
    def _compute_rules(self):
        orderpoints_to_compute = self.filtered(lambda orderpoint: orderpoint.product_id and orderpoint.location_id)
        # Products without routes have no impact on _get_rules_from_location.
        product_ids_with_routes = set(orderpoints_to_compute.product_id.filter_has_routes().ids)
        # Small cache mapping (location_id, route_id) -> stock.rule.
        # This reduces calls to _get_rules_from_location for products without routes.
        rules_cache = {}
        for orderpoint in orderpoints_to_compute:
            if orderpoint.product_id.id not in product_ids_with_routes:
                cache_key = (orderpoint.location_id, orderpoint.route_id)
                rule_ids = rules_cache.get(cache_key) or orderpoint.product_id._get_rules_from_location(
                    orderpoint.location_id, route_ids=orderpoint.route_id
                )
                orderpoint.rule_ids = rule_ids
                rules_cache[cache_key] = rule_ids
            else:
                orderpoint.rule_ids = orderpoint.product_id._get_rules_from_location(
                    orderpoint.location_id, route_ids=orderpoint.route_id
                )
        (self - orderpoints_to_compute).rule_ids = False

    @api.depends('product_max_qty')
    def _compute_product_min_qty(self):
        for orderpoint in self:
            if orderpoint.product_max_qty < orderpoint.product_min_qty or not orderpoint.product_min_qty:
                orderpoint.product_min_qty = orderpoint.product_max_qty

    @api.depends('product_min_qty')
    def _compute_product_max_qty(self):
        for orderpoint in self:
            if orderpoint.product_max_qty < orderpoint.product_min_qty or not orderpoint.product_max_qty:
                orderpoint.product_max_qty = orderpoint.product_min_qty

    @api.depends('route_id', 'product_id')
    def _compute_visibility_days(self):
        self.visibility_days = 0

    def _set_visibility_days(self):
        return True

    @api.depends('route_id', 'product_id')
    def _compute_days_to_order(self):
        self.days_to_order = 0

    @api.constrains('product_min_qty', 'product_max_qty')
    def _check_min_max_qty(self):
        if any(orderpoint.product_min_qty > orderpoint.product_max_qty for orderpoint in self):
            raise ValidationError(_('The minimum quantity must be less than or equal to the maximum quantity.'))

    @api.depends('location_id', 'company_id')
    def _compute_warehouse_id(self):
        for orderpoint in self:
            if orderpoint.location_id.warehouse_id:
                orderpoint.warehouse_id = orderpoint.location_id.warehouse_id
            elif orderpoint.company_id:
                orderpoint.warehouse_id = orderpoint.env['stock.warehouse'].search([
                    ('company_id', '=', orderpoint.company_id.id)
                ], limit=1)
            if not orderpoint.warehouse_id:
                self.env['stock.warehouse']._warehouse_redirect_warning()

    @api.depends('warehouse_id', 'company_id')
    def _compute_location_id(self):
        """ Finds location id for changed warehouse. """
        for orderpoint in self:
            warehouse = orderpoint.warehouse_id
            if not warehouse:
                warehouse = orderpoint.env['stock.warehouse'].search([
                    ('company_id', '=', orderpoint.company_id.id)
                ], limit=1)
            orderpoint.location_id = warehouse.lot_stock_id.id

    @api.depends('product_id', 'qty_to_order', 'product_max_qty')
    def _compute_unwanted_replenish(self):
        for orderpoint in self:
            if not orderpoint.product_id or float_is_zero(orderpoint.qty_to_order, precision_rounding=orderpoint.product_uom.rounding) or float_compare(orderpoint.product_max_qty, 0, precision_rounding=orderpoint.product_uom.rounding) == -1:
                orderpoint.unwanted_replenish = False
            else:
                after_replenish_qty = orderpoint.product_id.with_context(company_id=orderpoint.company_id.id, location=orderpoint.location_id.id).virtual_available + orderpoint.qty_to_order
                orderpoint.unwanted_replenish = float_compare(after_replenish_qty, orderpoint.product_max_qty, precision_rounding=orderpoint.product_uom.rounding) > 0

    @api.onchange('product_id')
    def _onchange_product_id(self):
        if self.product_id:
            self.product_uom = self.product_id.uom_id.id

    @api.onchange('route_id')
    def _onchange_route_id(self):
        if self.route_id:
            self.qty_multiple = self._get_qty_multiple_to_order()

    @api.model_create_multi
    def create(self, vals_list):
        if any(val.get('snoozed_until', False) and val.get('trigger', self.default_get(['trigger'])['trigger']) == 'auto' for val in vals_list):
            raise UserError(_("You can not create a snoozed orderpoint that is not manually triggered."))
        return super().create(vals_list)

    def write(self, vals):
        if 'company_id' in vals:
            for orderpoint in self:
                if orderpoint.company_id.id != vals['company_id']:
                    raise UserError(_("Changing the company of this record is forbidden at this point, you should rather archive it and create a new one."))
        if 'snoozed_until' in vals:
            if any(orderpoint.trigger == 'auto' for orderpoint in self):
                raise UserError(_("You can only snooze manual orderpoints. You should rather archive 'auto-trigger' orderpoints if you do not want them to be triggered."))
        return super().write(vals)

    def action_product_forecast_report(self):
        self.ensure_one()
        action = self.product_id.action_product_forecast_report()
        action['context'] = {
            'active_id': self.product_id.id,
            'active_model': 'product.product',
            'lead_days_date': format_date(self.env, self.lead_days_date),
            'qty_to_order': self._get_qty_to_order(force_visibility_days=0),
            'visibility_days_date': format_date(self.env, fields.Date.add(self.lead_days_date, days=int(self.visibility_days))),
            'qty_to_order_with_visibility_days': self.qty_to_order_computed,
        }
        warehouse = self.warehouse_id
        if warehouse:
            action['context']['warehouse_id'] = warehouse.id
        return action

    @api.model
    def action_open_orderpoints(self):
        return self._get_orderpoint_action()

    def action_stock_replenishment_info(self):
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id('stock.action_stock_replenishment_info')
        action['name'] = _(
            'Replenishment Information for %(product)s in %(warehouse)s',
            product=self.product_id.display_name,
            warehouse=self.warehouse_id.display_name,
        )
        res = self.env['stock.replenishment.info'].create({
            'orderpoint_id': self.id,
        })
        action['res_id'] = res.id
        return action

    def action_replenish(self, force_to_max=False):
        now = self.env.cr.now()
        if force_to_max:
            for orderpoint in self:
                orderpoint.qty_to_order = orderpoint.product_max_qty - orderpoint.qty_forecast
                remainder = orderpoint.qty_multiple > 0 and orderpoint.qty_to_order % orderpoint.qty_multiple or 0.0
                if not float_is_zero(remainder, precision_rounding=orderpoint.product_uom.rounding):
                    orderpoint.qty_to_order += orderpoint.qty_multiple - remainder
        try:
            self._procure_orderpoint_confirm(company_id=self.env.company)
        except UserError as e:
            if len(self) != 1:
                raise e
            raise RedirectWarning(e, {
                'name': self.product_id.display_name,
                'type': 'ir.actions.act_window',
                'res_model': 'product.product',
                'res_id': self.product_id.id,
                'views': [(self.env.ref('product.product_normal_form_view').id, 'form')],
            }, _('Edit Product'))
        notification = False
        if len(self) == 1:
            notification = self.with_context(written_after=now)._get_replenishment_order_notification()
        # Forced to call compute quantity because we don't have a link.
        self.action_remove_manual_qty_to_order()
        self._compute_qty_to_order()
        self.filtered(lambda o: o.create_uid.id == SUPERUSER_ID and o.qty_to_order <= 0.0 and o.trigger == 'manual').unlink()
        return notification

    def action_replenish_auto(self):
        self.trigger = 'auto'
        return self.action_replenish()

    @api.depends('product_id', 'location_id', 'product_id.stock_move_ids', 'product_id.stock_move_ids.state',
                 'product_id.stock_move_ids.date', 'product_id.stock_move_ids.product_uom_qty')
    def _compute_qty(self):
        orderpoints_contexts = defaultdict(lambda: self.env['stock.warehouse.orderpoint'])
        for orderpoint in self:
            if not orderpoint.product_id or not orderpoint.location_id:
                orderpoint.qty_on_hand = False
                orderpoint.qty_forecast = False
                continue
            orderpoint_context = orderpoint._get_product_context()
            product_context = frozendict({**orderpoint_context})
            orderpoints_contexts[product_context] |= orderpoint
        for orderpoint_context, orderpoints_by_context in orderpoints_contexts.items():
            products_qty = {
                p['id']: p for p in orderpoints_by_context.product_id.with_context(orderpoint_context).read(['qty_available', 'virtual_available'])
            }
            products_qty_in_progress = orderpoints_by_context._quantity_in_progress()
            for orderpoint in orderpoints_by_context:
                orderpoint.qty_on_hand = products_qty[orderpoint.product_id.id]['qty_available']
                orderpoint.qty_forecast = products_qty[orderpoint.product_id.id]['virtual_available'] + products_qty_in_progress[orderpoint.id]

    @api.depends('qty_to_order_manual', 'qty_to_order_computed')
    def _compute_qty_to_order(self):
        for orderpoint in self:
            orderpoint.qty_to_order = orderpoint.qty_to_order_manual if orderpoint.qty_to_order_manual else orderpoint.qty_to_order_computed

    def _inverse_qty_to_order(self):
        for orderpoint in self:
            if orderpoint.trigger == 'auto':
                orderpoint.qty_to_order_manual = 0
            elif orderpoint.qty_to_order != orderpoint.qty_to_order_computed:
                orderpoint.qty_to_order_manual = orderpoint.qty_to_order

    def _search_qty_to_order(self, operator, value):
        records = self.search_fetch([('qty_to_order_manual', 'in', [0, False])], ['qty_to_order_computed'])
        matched_ids = records.filtered_domain([('qty_to_order_computed', operator, value)]).ids
        return ['|',
                    ('qty_to_order_manual', operator, value),
                    ('id', 'in', matched_ids)
                ]

    @api.depends('qty_multiple', 'qty_forecast', 'product_min_qty', 'product_max_qty', 'visibility_days')
    def _compute_qty_to_order_computed(self):
        orderpoints_to_compute = self.filtered(lambda orderpoint: orderpoint.product_id and orderpoint.location_id)
        qty_in_progress_by_orderpoint = orderpoints_to_compute._quantity_in_progress()
        for orderpoint in self:
            orderpoint.qty_to_order_computed = orderpoint._get_qty_to_order(qty_in_progress_by_orderpoint=qty_in_progress_by_orderpoint)
        (self - orderpoints_to_compute).qty_to_order_computed = False

    def _get_qty_to_order(self, force_visibility_days=False, qty_in_progress_by_orderpoint={}):
        self.ensure_one()
        if not self.product_id or not self.location_id:
            return False
        visibility_days = self.visibility_days
        if force_visibility_days is not False:
            # Accepts falsy values such as 0.
            visibility_days = force_visibility_days
        qty_to_order = 0.0
        rounding = self.product_uom.rounding
        # The check is on purpose. We only want to consider the visibility days if the forecast is negative and
        # there is a already something to ressuply base on lead times.
        if float_compare(self.qty_forecast, self.product_min_qty, precision_rounding=rounding) < 0:
            # We want to know how much we should order to also satisfy the needs that gonna appear in the next (visibility) days
            product_context = self._get_product_context(visibility_days=visibility_days)
            qty_in_progress = qty_in_progress_by_orderpoint.get(self.id) or self._quantity_in_progress()[self.id]
            qty_forecast_with_visibility = self.product_id.with_context(product_context).read(['virtual_available'])[0]['virtual_available'] + qty_in_progress
            qty_to_order = max(self.product_min_qty, self.product_max_qty) - qty_forecast_with_visibility
            remainder = (self.qty_multiple > 0.0 and qty_to_order % self.qty_multiple) or 0.0
            if (float_compare(remainder, 0.0, precision_rounding=rounding) > 0
                    and float_compare(self.qty_multiple - remainder, 0.0, precision_rounding=rounding) > 0):
                if float_is_zero(self.product_max_qty, precision_rounding=rounding):
                    qty_to_order += self.qty_multiple - remainder
                else:
                    qty_to_order -= remainder
        return qty_to_order

    def _get_qty_multiple_to_order(self):
        """ Calculates the minimum quantity that can be ordered according to the PO UoM or BoM
        """
        self.ensure_one()
        return 0

    def _set_default_route_id(self):
        """ Write the `route_id` field on `self`. This method is intendend to be called on the
        orderpoints generated when openning the replenish report.
        """
        self = self.filtered(lambda o: not o.route_id)
        rules_groups = self.env['stock.rule']._read_group([
            ('route_id.product_selectable', '!=', False),
            ('location_dest_id', 'in', self.location_id.ids),
            ('action', 'in', ['pull_push', 'pull']),
            ('route_id.active', '!=', False)
        ], ['location_dest_id', 'route_id'])
        for location_dest, route in rules_groups:
            orderpoints = self.filtered(lambda o: o.location_id.id == location_dest.id)
            orderpoints.route_id = route

    def _get_lead_days_values(self):
        self.ensure_one()
        return {
            'days_to_order': self.days_to_order,
        }

    def _get_product_context(self, visibility_days=0):
        """Used to call `virtual_available` when running an orderpoint."""
        self.ensure_one()
        return {
            'location': self.location_id.id,
            'to_date': datetime.combine(self.lead_days_date + relativedelta.relativedelta(days=visibility_days), time.max)
        }

    def _get_orderpoint_action(self):
        """Create manual orderpoints for missing product in each warehouses. It also removes
        orderpoints that have been replenish. In order to do it:
        - It uses the report.stock.quantity to find missing quantity per product/warehouse
        - It checks if orderpoint already exist to refill this location.
        - It checks if it exists other sources (e.g RFQ) tha refill the warehouse.
        - It creates the orderpoints for missing quantity that were not refill by an upper option.

        return replenish report ir.actions.act_window
        """
        def is_parent_path_in(resupply_loc, path_dict, record_loc):
            return record_loc and resupply_loc.parent_path in path_dict.get(record_loc, '')

        action = self.env["ir.actions.actions"]._for_xml_id("stock.action_orderpoint_replenish")
        action['context'] = self.env.context
        # Search also with archived ones to avoid to trigger product_location_check SQL constraints later
        # It means that when there will be a archived orderpoint on a location + product, the replenishment
        # report won't take in account this location + product and it won't create any manual orderpoint
        # In master: the active field should be remove
        orderpoints = self.env['stock.warehouse.orderpoint'].with_context(active_test=False).search([])
        # Remove previous automatically created orderpoint that has been refilled.
        orderpoints_removed = orderpoints._unlink_processed_orderpoints()
        orderpoints = orderpoints - orderpoints_removed
        to_refill = defaultdict(float)
        all_product_ids = self._get_orderpoint_products()
        all_replenish_location_ids = self._get_orderpoint_locations()
        ploc_per_day = defaultdict(set)
        # For each replenish location get products with negative virtual_available aka forecast


        Move = self.env['stock.move'].with_context(active_test=False)
        Quant = self.env['stock.quant'].with_context(active_test=False)
        domain_quant, domain_move_in_loc, domain_move_out_loc = all_product_ids._get_domain_locations_new(all_replenish_location_ids.ids)
        domain_state = [('state', 'in', ('waiting', 'confirmed', 'assigned', 'partially_available'))]
        domain_product = [['product_id', 'in', all_product_ids.ids]]

        domain_quant = expression.AND([domain_product, domain_quant])
        domain_move_in = expression.AND([domain_product, domain_state, domain_move_in_loc])
        domain_move_out = expression.AND([domain_product, domain_state, domain_move_out_loc])

        moves_in = defaultdict(list)
        for item in Move._read_group(domain_move_in, ['product_id', 'location_dest_id', 'location_final_id'], ['product_qty:sum']):
            moves_in[item[0]].append((item[1], item[2], item[3]))

        moves_out = defaultdict(list)
        for item in Move._read_group(domain_move_out, ['product_id', 'location_id'], ['product_qty:sum']):
            moves_out[item[0]].append((item[1], item[2]))

        quants = defaultdict(list)
        for item in Quant._read_group(domain_quant, ['product_id', 'location_id'], ['quantity:sum']):
            quants[item[0]].append((item[1], item[2]))

        rounding = {product.id: product.uom_id.rounding for product in all_product_ids}
        path = {loc: loc.parent_path for loc in self.env['stock.location'].with_context(active_test=False).search([('id', 'child_of', all_replenish_location_ids.ids)])}
        for loc in all_replenish_location_ids:
            for product in all_product_ids:
                qty_available = sum(q[1] for q in quants.get(product, [(0, 0)]) if is_parent_path_in(loc, path, q[0]))
                incoming_qty = sum(m[2] for m in moves_in.get(product, [(0, 0, 0)]) if is_parent_path_in(loc, path, m[0]) or is_parent_path_in(loc, path, m[1]))
                outgoing_qty = sum(m[1] for m in moves_out.get(product, [(0, 0)]) if is_parent_path_in(loc, path, m[0]))
                if float_compare(qty_available + incoming_qty - outgoing_qty, 0, precision_rounding=rounding[product.id]) < 0:
                    # group product by lead_days and location in order to read virtual_available
                    # in batch
                    rules = product._get_rules_from_location(loc)
                    lead_days = rules.with_context(bypass_delay_description=True)._get_lead_days(product)[0]['total_delay']
                    ploc_per_day[(lead_days, loc)].add(product.id)

        # recompute virtual_available with lead days
        today = fields.Datetime.now().replace(hour=23, minute=59, second=59)
        for (days, loc), product_ids in ploc_per_day.items():
            products = self.env['product.product'].browse(product_ids)
            qties = products.with_context(
                location=loc.id,
                to_date=today + relativedelta.relativedelta(days=days)
            ).read(['virtual_available'])
            for (product, qty) in zip(products, qties):
                if float_compare(qty['virtual_available'], 0, precision_rounding=product.uom_id.rounding) < 0:
                    to_refill[(qty['id'], loc.id)] = qty['virtual_available']
            products.invalidate_recordset()
        if not to_refill:
            return action

        # Remove incoming quantity from other origin than moves (e.g RFQ)
        product_ids, location_ids = zip(*to_refill)
        qty_by_product_loc, dummy = self.env['product.product'].browse(product_ids)._get_quantity_in_progress(location_ids=location_ids)
        rounding = self.env['decimal.precision'].precision_get('Product Unit of Measure')
        # Group orderpoint by product-location
        orderpoint_by_product_location = self.env['stock.warehouse.orderpoint']._read_group(
            [('id', 'in', orderpoints.ids)],
            ['product_id', 'location_id'],
            ['id:recordset'])
        orderpoint_by_product_location = {
            (product.id, location.id): orderpoint.qty_to_order
            for product, location, orderpoint in orderpoint_by_product_location
        }
        for (product, location), product_qty in to_refill.items():
            qty_in_progress = qty_by_product_loc.get((product, location)) or 0.0
            qty_in_progress += orderpoint_by_product_location.get((product, location), 0.0)
            # Add qty to order for other orderpoint under this location.
            if not qty_in_progress:
                continue
            to_refill[(product, location)] = product_qty + qty_in_progress
        to_refill = {k: v for k, v in to_refill.items() if float_compare(
            v, 0.0, precision_digits=rounding) < 0.0}

        # With archived ones to avoid `product_location_check` SQL constraints
        orderpoint_by_product_location = self.env['stock.warehouse.orderpoint'].with_context(active_test=False)._read_group(
            [('id', 'in', orderpoints.ids)],
            ['product_id', 'location_id'],
            ['id:recordset'])
        orderpoint_by_product_location = {
            (product.id, location.id): orderpoint
            for product, location, orderpoint in orderpoint_by_product_location
        }

        orderpoint_values_list = []
        for (product, location_id), product_qty in to_refill.items():
            orderpoint = orderpoint_by_product_location.get((product, location_id))
            if orderpoint:
                orderpoint.qty_forecast += product_qty
            else:
                orderpoint_values = self.env['stock.warehouse.orderpoint']._get_orderpoint_values(product, location_id)
                location = self.env['stock.location'].browse(location_id)
                orderpoint_values.update({
                    'name': _('Replenishment Report'),
                    'warehouse_id': location.warehouse_id.id or self.env['stock.warehouse'].search([('company_id', '=', location.company_id.id)], limit=1).id,
                    'company_id': location.company_id.id,
                })
                orderpoint_values_list.append(orderpoint_values)

        orderpoints = self.env['stock.warehouse.orderpoint'].with_user(SUPERUSER_ID).create(orderpoint_values_list)
        for orderpoint in orderpoints:
            orderpoint._set_default_route_id()
            orderpoint.qty_multiple = orderpoint._get_qty_multiple_to_order()
        return action

    def action_remove_manual_qty_to_order(self):
        self.qty_to_order_manual = 0

    @api.model
    def _get_orderpoint_values(self, product, location):
        return {
            'product_id': product,
            'location_id': location,
            'product_max_qty': 0.0,
            'product_min_qty': 0.0,
            'trigger': 'manual',
        }

    def _get_replenishment_order_notification(self):
        self.ensure_one()
        domain = [('orderpoint_id', 'in', self.ids)]
        if self.env.context.get('written_after'):
            domain = expression.AND([domain, [('write_date', '>=', self.env.context.get('written_after'))]])
        move = self.env['stock.move'].search(domain, limit=1)
        if ((move.location_id.warehouse_id and move.location_id.warehouse_id != self.warehouse_id)
            or move.location_id.usage == 'transit') and move.picking_id:
            action = self.env.ref('stock.stock_picking_action_picking_type')
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('The inter-warehouse transfers have been generated'),
                    'message': '%s',
                    'links': [{
                        'label': move.picking_id.name,
                        'url': f'/odoo/action-stock.stock_picking_action_picking_type/{move.picking_id.id}'
                    }],
                    'sticky': False,
                    'next': {'type': 'ir.actions.act_window_close'},
                }
            }
        return False

    def _quantity_in_progress(self):
        """Return Quantities that are not yet in virtual stock but should be deduced from orderpoint rule
        (example: purchases created from orderpoints)"""
        return dict(self.mapped(lambda x: (x.id, 0.0)))

    @api.autovacuum
    def _unlink_processed_orderpoints(self):
        domain = [
            ('create_uid', '=', SUPERUSER_ID),
            ('trigger', '=', 'manual'),
            ('qty_to_order', '<=', 0)
        ]
        if self.ids:
            expression.AND([domain, [('ids', 'in', self.ids)]])
        orderpoints_to_remove = self.env['stock.warehouse.orderpoint'].with_context(active_test=False).search(domain)
        # Remove previous automatically created orderpoint that has been refilled.
        orderpoints_to_remove.unlink()
        return orderpoints_to_remove

    def _prepare_procurement_values(self, date=False, group=False):
        """ Prepare specific key for moves or other components that will be created from a stock rule
        comming from an orderpoint. This method could be override in order to add other custom key that could
        be used in move/po creation.
        """
        date_deadline = date or fields.Date.today()
        dates_info = self.product_id._get_dates_info(date_deadline, self.location_id, route_ids=self.route_id)
        return {
            'route_ids': self.route_id,
            'date_planned': dates_info['date_planned'],
            'date_order': dates_info['date_order'],
            'date_deadline': date or False,
            'warehouse_id': self.warehouse_id,
            'orderpoint_id': self,
            'group_id': group or self.group_id,
        }

    def _procure_orderpoint_confirm(self, use_new_cursor=False, company_id=None, raise_user_error=True):
        """ Create procurements based on orderpoints.
        :param bool use_new_cursor: if set, use a dedicated cursor and auto-commit after processing
            1000 orderpoints.
            This is appropriate for batch jobs only.
        """
        self = self.with_company(company_id)

        for orderpoints_batch_ids in split_every(1000, self.ids):
            if use_new_cursor:
                assert isinstance(self._cr, BaseCursor)
                cr = Registry(self._cr.dbname).cursor()
                self = self.with_env(self.env(cr=cr))
            try:
                orderpoints_batch = self.env['stock.warehouse.orderpoint'].browse(orderpoints_batch_ids)
                all_orderpoints_exceptions = []
                while orderpoints_batch:
                    procurements = []
                    for orderpoint in orderpoints_batch:
                        origins = orderpoint.env.context.get('origins', {}).get(orderpoint.id, False)
                        if origins:
                            origin = '%s - %s' % (orderpoint.display_name, ','.join(origins))
                        else:
                            origin = orderpoint.name
                        if float_compare(orderpoint.qty_to_order, 0.0, precision_rounding=orderpoint.product_uom.rounding) == 1:
                            date = orderpoint._get_orderpoint_procurement_date()
                            global_visibility_days = self.env.context.get('global_visibility_days', self.env['ir.config_parameter'].sudo().get_param('stock.visibility_days', 0))
                            if global_visibility_days:
                                date -= relativedelta.relativedelta(days=int(global_visibility_days))
                            values = orderpoint._prepare_procurement_values(date=date)
                            procurements.append(self.env['procurement.group'].Procurement(
                                orderpoint.product_id, orderpoint.qty_to_order, orderpoint.product_uom,
                                orderpoint.location_id, orderpoint.name, origin,
                                orderpoint.company_id, values))

                    try:
                        with self.env.cr.savepoint():
                            self.env['procurement.group'].with_context(from_orderpoint=True).run(procurements, raise_user_error=raise_user_error)
                    except ProcurementException as errors:
                        orderpoints_exceptions = []
                        for procurement, error_msg in errors.procurement_exceptions:
                            orderpoints_exceptions += [(procurement.values.get('orderpoint_id'), error_msg)]
                        all_orderpoints_exceptions += orderpoints_exceptions
                        failed_orderpoints = self.env['stock.warehouse.orderpoint'].concat(*[o[0] for o in orderpoints_exceptions])
                        if not failed_orderpoints:
                            _logger.error('Unable to process orderpoints')
                            break
                        orderpoints_batch -= failed_orderpoints

                    except OperationalError:
                        if use_new_cursor:
                            cr.rollback()
                            continue
                        else:
                            raise
                    else:
                        orderpoints_batch._post_process_scheduler()
                        break

                # Log an activity on product template for failed orderpoints.
                for orderpoint, error_msg in all_orderpoints_exceptions:
                    existing_activity = self.env['mail.activity'].search([
                        ('res_id', '=', orderpoint.product_id.product_tmpl_id.id),
                        ('res_model_id', '=', self.env.ref('product.model_product_template').id),
                        ('note', '=', error_msg)])
                    if not existing_activity:
                        orderpoint.product_id.product_tmpl_id.sudo().activity_schedule(
                            'mail.mail_activity_data_warning',
                            note=error_msg,
                            user_id=orderpoint.product_id.responsible_id.id or SUPERUSER_ID,
                        )

            finally:
                if use_new_cursor:
                    try:
                        cr.commit()
                    finally:
                        cr.close()
                    _logger.info("A batch of %d orderpoints is processed and committed", len(orderpoints_batch_ids))

        return {}

    def _post_process_scheduler(self):
        return True

    def _get_orderpoint_procurement_date(self):
        return timezone(self.company_id.partner_id.tz or 'UTC').localize(datetime.combine(self.lead_days_date, time(12))).astimezone(UTC).replace(tzinfo=None)

    def _get_orderpoint_products(self):
        return self.env['product.product'].search([('is_storable', '=', True), ('stock_move_ids', '!=', False)])

    def _get_orderpoint_locations(self):
        return self.env['stock.location'].search([('replenish_location', '=', True)])
