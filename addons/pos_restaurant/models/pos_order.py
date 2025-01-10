# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models
from uuid import uuid4

class PosOrder(models.Model):
    _inherit = 'pos.order'

    table_id = fields.Many2one('restaurant.table', string='Table', help='The table where this order was served', index='btree_not_null', readonly=True)
    customer_count = fields.Integer(string='Guests', help='The amount of customers that have been served by this order.', readonly=True)
    origin_table_id = fields.Many2one('restaurant.table', string='Original Table', help='The table where the order was originally created', readonly=True)
    course_ids = fields.One2many('restaurant.order.course', 'order_id', string="Courses")

    def _get_open_order(self, order):
        config_id = self.env['pos.session'].browse(order.get('session_id')).config_id
        if not config_id.module_pos_restaurant:
            return super()._get_open_order(order)

        domain = []
        if order.get('table_id', False) and order.get('state') == 'draft':
            domain += ['|', ('uuid', '=', order.get('uuid')), ('table_id', '=', order.get('table_id')), ('state', '=', 'draft')]
        else:
            domain += [('uuid', '=', order.get('uuid'))]
        return self.env["pos.order"].search(domain, limit=1)

    @api.model
    def remove_from_ui(self, server_ids):
        tables = self.env['pos.order'].search([('id', 'in', server_ids)]).table_id
        order_ids = super().remove_from_ui(server_ids)
        self.send_table_count_notification(tables)
        return order_ids

    @api.model
    def sync_from_ui(self, orders):
        result = super().sync_from_ui(orders)

        order_ids = self.browse([o['id'] for o in result["pos.order"]])
        if order_ids:
            config_id = order_ids.config_id.ids[0] if order_ids else False
            result['restaurant.order.course'] = order_ids.course_ids.read(order_ids.course_ids._load_pos_data_fields(config_id), load=False) if config_id else []
        else:
            result['restaurant.order.course'] = []
        if self.env.context.get('table_ids'):
            order_ids = [order['id'] for order in result['pos.order']]
            table_orders = self.search([
                "&",
                ('table_id', 'in', self.env.context['table_ids']),
                ('state', '=', 'draft'),
                ('id', 'not in', order_ids)
            ])

            if len(table_orders) > 0:
                config_id = table_orders[0].config_id.id
                result['pos.order'].extend(table_orders.read(table_orders._load_pos_data_fields(config_id), load=False))
                result['pos.payment'].extend(table_orders.payment_ids.read(table_orders.payment_ids._load_pos_data_fields(config_id), load=False))
                result['pos.order.line'].extend(table_orders.lines.read(table_orders.lines._load_pos_data_fields(config_id), load=False))
                result['pos.pack.operation.lot'].extend(table_orders.lines.pack_lot_ids.read(table_orders.lines.pack_lot_ids._load_pos_data_fields(config_id), load=False))
                result["product.attribute.custom.value"].extend(table_orders.lines.custom_attribute_value_ids.read(table_orders.lines.custom_attribute_value_ids._load_pos_data_fields(config_id), load=False))
                result["restaurant.order.course"].extend(table_orders.course_ids.read(table_orders.course_ids._load_pos_data_fields(config_id), load=False))

        return result

    def _process_order(self, order, existing_order):
        restaurant_course_lines = order.pop("restaurant_course_lines", None)
        order_id = super()._process_order(order, existing_order)
        self._update_course_lines(order_id, restaurant_course_lines)
        return order_id

    def _update_course_lines(self, order_id, restaurant_course_lines):
        """
        Assigns the `course_id` field of order lines based on the relationship defined in the `order_course_lines` dictionary.
        This dictionary links each course UUID to its corresponding list of line UUIDs.
        """
        if not restaurant_course_lines:
            return
        courses = self.env['restaurant.order.course'].search_read([('order_id', '=', order_id)], fields=['uuid', 'id'], load=False)
        course_id_by_uuid = {c['uuid']: c['id'] for c in courses}
        line_uuids = set()
        for course_line_uuids in restaurant_course_lines.values():
            line_uuids.update(course_line_uuids)
        line_uuids = list(line_uuids)
        lines = self.env['pos.order.line'].search([('order_id', '=', order_id), ('uuid', 'in', line_uuids)])
        for course_uuid, line_uuids in restaurant_course_lines.items():
            course_id = course_id_by_uuid.get(course_uuid)
            if course_id:
                lines.filtered(lambda l: l.uuid in line_uuids).write({'course_id': course_id})

    def _process_saved_order(self, draft):
        order_id = super()._process_saved_order(draft)
        if not self.env.context.get('cancel_table_notification'):
            self.send_table_count_notification(self.table_id)
        return order_id

    def send_table_count_notification(self, table_ids):
        messages = []
        a_config = []
        for config in self.env['pos.config'].search([('floor_ids', 'in', table_ids.floor_id.ids)]):
            if config.current_session_id:
                a_config.append(config)
                draft_order_ids = self.search([
                    ('table_id', 'in', table_ids.ids),
                    ('state', '=', 'draft')
                ]).ids
                messages.append(
                    (
                        "SYNC_ORDERS",
                        {
                            'table_ids': table_ids.ids,
                            'login_number': self.env.context.get('login_number', False),
                            'order_ids': draft_order_ids,
                        }
                    )
                )
        if messages:
            for config in a_config:
                config._notify(*messages, private=False)

    def action_pos_order_cancel(self):
        super().action_pos_order_cancel()
        if self.table_id:
            self.send_table_count_notification(self.table_id)

class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'
    course_id = fields.Many2one('restaurant.order.course', string="Course Ref", ondelete="set null")

    @api.model
    def _load_pos_data_fields(self, config_id):
        result = super()._load_pos_data_fields(config_id)
        return result + ["course_id"]

class RestaurantOrderCourse(models.Model):
    _name = 'restaurant.order.course'
    _description = 'POS Restaurant Order Course'
    _inherit = ['pos.load.mixin']

    fired = fields.Boolean(string="Fired", default=False)
    fired_date = fields.Datetime(string="Fired Date")
    uuid = fields.Char(string='Uuid', readonly=True, default=lambda self: str(uuid4()), copy=False)
    index = fields.Integer(string="Course index", default=0)
    order_id = fields.Many2one('pos.order', string='Order Ref', required=True, index=True, ondelete='cascade')
    line_ids = fields.One2many('pos.order.line', 'course_id', string="Order Lines", readonly=True)

    def write(self, vals):
        if vals.get('fired') and not self.fired_date:
            vals['fired_date'] = fields.Datetime.now()
        return super().write(vals)

    @api.model
    def _load_pos_data_domain(self, data):
        return [('order_id', 'in', [order['id'] for order in data['pos.order']])]

    @api.model
    def _load_pos_data_fields(self, config_id):
        return ['uuid', 'fired', 'order_id', 'line_ids', 'index']

