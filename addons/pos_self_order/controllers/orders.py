# -*- coding: utf-8 -*-
import re
import uuid
from datetime import timedelta
from odoo import http, fields
from odoo.http import request
from odoo.addons.pos_self_order.controllers.utils import reduce_privilege
from werkzeug.exceptions import NotFound, BadRequest, Unauthorized

class PosSelfOrderController(http.Controller):
    @http.route("/pos-self-order/process-new-order/<device_type>/", auth="public", type="json", website=True)
    def process_new_order(self, order, access_token, table_identifier, device_type):
        lines = order.get('lines')
        pos_config, table = self._verify_authorization(access_token, table_identifier)
        pos_session = pos_config.current_session_id

        date_string = fields.Date.today().isoformat()
        ir_sequence_session = pos_config.env['ir.sequence'].with_context(company_id=pos_config.company_id.id).next_by_code(f'pos.order_{pos_session.id}')
        ir_sequence_tracking = pos_config.env['ir.sequence'].with_context(company_id=pos_config.company_id.id).next_by_code(f'pos.order_{date_string}')

        sequence_number = re.findall(r'\d+', ir_sequence_session)[0]
        order_reference = self._generate_unique_id(pos_session.id, pos_config.id, sequence_number, device_type)
        tracking_number = f"{'A' if device_type == 'kiosk' else 'B'}{ir_sequence_tracking}"

        # Create the order without lines and prices computed
        # We need to remap the order because some required fields are not used in the frontend.
        order = {
            'data': {
                'name': order_reference,
                'sequence_number': sequence_number,
                'uuid': order.get('uuid'),
                'take_away': order.get('take_away'),
                'user_id': request.session.uid,
                'access_token': uuid.uuid4().hex,
                'pos_session_id': pos_session.id,
                'table_id': table.id if table else False,
                'partner_id': False,
                'date_order': str(fields.Datetime.now()),
                'fiscal_position_id': pos_config.default_fiscal_position_id.id,
                'statement_ids': [],
                'lines': [],
                'amount_tax': 0,
                'amount_total': 0,
                'amount_paid': 0,
                'amount_return': 0,
                'tracking_number': tracking_number,
            },
            'to_invoice': False,
            'session_id': pos_session.id,
        }

        # Save the order in the database to get the id
        posted_order_id = pos_config.env['pos.order'].with_context(from_self=True).create_from_ui([order], draft=True)[0].get('id')

        # Process the lines and get their prices computed
        lines = self._process_lines(lines, pos_config, posted_order_id, order.get('take_away'))

        # Compute the order prices
        amount_total, amount_untaxed = self._get_order_prices(lines)

        # Update the order with the computed prices and lines
        order = pos_config.env["pos.order"].browse(posted_order_id)

        classic_lines = []
        combo_lines = []
        for line in lines:
            if line["combo_parent_uuid"]:
                combo_lines.append(line)
            else:
                classic_lines.append(line)

        # combo lines must be created after classic_line, as they need the classic line identifier
        lines = pos_config.env['pos.order.line'].create(classic_lines)
        lines += pos_config.env['pos.order.line'].create(combo_lines)
        order.write({
            'lines': lines,
            'amount_tax': amount_total - amount_untaxed,
            'amount_total': amount_total,
        })

        order.send_table_count_notification(order.table_id)
        return order._export_for_self_order()

    @http.route('/pos-self-order/get-orders-taxes', auth='public', type='json', website=True)
    def get_order_taxes(self, order, access_token):
        pos_config = self._verify_pos_config(access_token)
        lines = self._process_lines(order.get('lines'), pos_config, 0, order.get('take_away'))
        amount_total, amount_untaxed = self._get_order_prices(lines)

        return {
            'lines': [{
                'uuid': line.get('uuid'),
                'price_unit': line.get('price_unit'),
                'price_extra': line.get('price_extra'),
                'price_subtotal': line.get('price_subtotal'),
                'price_subtotal_incl': line.get('price_subtotal_incl'),
            } for line in lines],
            'amount_total': amount_total,
            'amount_tax': amount_total - amount_untaxed,
        }

    @http.route('/pos-self-order/update-existing-order', auth="public", type="json", website=True)
    def update_existing_order(self, order, access_token, table_identifier):
        order_id = order.get('id')
        order_access_token = order.get('access_token')
        pos_config, table = self._verify_authorization(access_token, table_identifier)
        session = pos_config.current_session_id

        pos_order = session.order_ids.filtered_domain([
            ('id', '=', order_id),
            ('access_token', '=', order_access_token),
        ])

        if not pos_order:
            raise Unauthorized("Order not found in the server !")
        elif pos_order.state != 'draft':
            raise Unauthorized("Order is not in draft state")

        lines = self._process_lines(order.get('lines'), pos_config, pos_order.id, order.get('take_away'))
        for line in lines:
            if line.get('id'):
                # we need to find by uuid because each time we update the order, id of orderlines changed.
                order_line = pos_order.lines.filtered(lambda l: l.uuid == line.get('uuid'))

                if line.get('qty') < order_line.qty:
                    line.set('qty', order_line.qty)

                if order_line:
                    order_line.write({
                        **line,
                    })
            else:
                pos_order.lines.create(line)

        amount_total, amount_untaxed = self._get_order_prices(lines)
        pos_order.write({
            'amount_tax': amount_total - amount_untaxed,
            'amount_total': amount_total,
        })
        pos_order.send_table_count_notification(pos_order.table_id)
        return pos_order._export_for_self_order()

    @http.route('/pos-self-order/get-orders', auth='public', type='json', website=True)
    def get_orders_by_access_token(self, access_token, order_access_tokens):
        pos_config = self._verify_pos_config(access_token)
        session = pos_config.current_session_id
        orders = session.order_ids.filtered_domain([
            ("access_token", "in", order_access_tokens),
            ("date_order", ">=", fields.Datetime.now() - timedelta(days=7)),
        ])

        if not orders:
            raise NotFound("Orders not found")

        orders_for_ui = []
        for order in orders:
            orders_for_ui.append(order._export_for_self_order())

        return orders_for_ui

    @http.route('/pos-self-order/get-tables', auth='public', type='json', website=True)
    def get_tables(self, access_token):
        pos_config = self._verify_pos_config(access_token)
        tables = pos_config.floor_ids.table_ids.filtered(lambda t: t.active).read(['id', 'name', 'identifier', 'floor_id'])

        for table in tables:
            table['floor_name'] = table.get('floor_id')[1]

        return tables


    @http.route('/kiosk/payment/<int:pos_config_id>/<device_type>', auth='public', type='json', website=True)
    def pos_self_order_kiosk_payment(self, pos_config_id, order, payment_method_id, access_token, device_type):
        order_dict = self.process_new_order(order, access_token, None, device_type)

        if not order_dict.get('id'):
            raise BadRequest("Something went wrong")

        # access_token verified in process_new_order
        order_sudo = request.env['pos.order'].sudo().browse(order_dict.get('id'))
        payment_method_sudo = request.env["pos.payment.method"].sudo().browse(payment_method_id)
        if not order_sudo or not payment_method_sudo or payment_method_sudo not in order_sudo.config_id.payment_method_ids:
            raise NotFound("Order or payment method not found")

        status = payment_method_sudo.payment_request_from_kiosk(order_sudo)

        if not status:
            raise BadRequest("Something went wrong")

        return order_sudo._export_for_self_order()

    def _process_lines(self, lines, pos_config, pos_order_id, take_away=False):
        appended_uuid = []
        newLines = []
        pricelist = pos_config.pricelist_id
        if take_away and pos_config.self_order_kiosk:
            config_fiscal_pos = pos_config.self_order_kiosk_alternative_fp_id
        else:
            config_fiscal_pos = pos_config.default_fiscal_position_id

        for line in lines:
            attribute_value = pos_config.env['product.template.attribute.value'].browse(line.get('selected_attributes'))
            if line.get('uuid') in appended_uuid or not line.get('product_id'):
                continue

            product = pos_config.env['product.product'].browse(int(line.get('product_id')))
            context = product._get_product_price_context(attribute_value)
            product = product.with_context(**context)
            price_unit = pricelist._get_product_price(product, quantity=line.get('qty')) if pricelist else product.lst_price

            selected_account_tax = config_fiscal_pos.map_tax(product.taxes_id) if config_fiscal_pos else product.taxes_id
            # parent_product_taxe_ids = None
            children = [l for l in lines if l.get('combo_parent_uuid') == line.get('uuid')]
            if len(children) > 0:
                total_price = 0
                unit_price_by_id = {}
                for child in children:
                    product = pos_config.env['product.product'].browse(int(child.get('product_id')))
                    child_selected_account_tax = config_fiscal_pos.map_tax(product.taxes_id) if config_fiscal_pos else product.taxes_id
                    tax_results = child_selected_account_tax.compute_all(
                        pricelist._get_product_price(product, quantity=line.get('qty')) if pricelist else product.lst_price,
                        pos_config.currency_id,
                        child.get('qty'),
                        product,
                    )
                    unit_price_by_id[child['uuid']] = pricelist._get_product_price(product, quantity=line.get('qty')) if pricelist else product.lst_price
                    total_price += tax_results.get('total_included') if pos_config.iface_tax_included == 'total' else tax_results.get('total_excluded')
                ratio = (price_unit * line.get('qty') / total_price)
                for child in children:
                    child_line_combo = pos_config.env['pos.combo'].browse(int(child.get('combo_id')))
                    child_line_combo_line = child_line_combo.combo_line_ids.filtered(lambda l: l.product_id.id == child.get('product_id'))[0]
                    child_product = pos_config.env["product.product"].browse(int(child.get('product_id')))
                    child_price_unit = ratio * unit_price_by_id[child['uuid']] + child_line_combo_line.combo_price
                    child_selected_account_tax = config_fiscal_pos.map_tax(child_product.taxes_id) if config_fiscal_pos else child_product.taxes_id
                    child_tax_results = child_selected_account_tax.compute_all(
                        child_price_unit,
                        pos_config.currency_id,
                        child.get('qty'),
                        child_product,
                    )
                    newLines.append({
                        'price_unit': child_price_unit,
                        'price_subtotal': child_tax_results.get('total_excluded'),
                        'price_subtotal_incl': child_tax_results.get('total_included'),
                        'id': child.get('id'),
                        'order_id': pos_order_id,
                        'tax_ids': product.taxes_id,
                        'uuid': child.get('uuid'),
                        'product_id': child.get('product_id'),
                        'qty': child.get('qty'),
                        'customer_note': child.get('customer_note'),
                        'attribute_value_ids': child.get('selected_attributes') or [],
                        'full_product_name': child.get('full_product_name'),
                        'combo_parent_uuid': child.get('combo_parent_uuid'),
                        'combo_id': child.get('combo_id'),
                    })
                    appended_uuid.append(child.get('uuid'))
                price_unit = 0

            tax_results = selected_account_tax.compute_all(
                price_unit,
                pos_config.currency_id,
                line.get('qty'),
                product,
            )

            newLines.append({
                'price_unit': price_unit,
                'price_subtotal': tax_results.get('total_excluded'),
                'price_subtotal_incl': tax_results.get('total_included'),
                'id': line.get('id'),
                'order_id': pos_order_id,
                'tax_ids': product.taxes_id,
                'uuid': line.get('uuid'),
                'product_id': line.get('product_id'),
                'qty': line.get('qty'),
                'customer_note': line.get('customer_note'),
                'attribute_value_ids': line.get('selected_attributes') or [],
                'full_product_name': line.get('full_product_name'),
                'combo_parent_uuid': line.get('combo_parent_uuid'),
                'combo_id': line.get('combo_id'),
            })
            appended_uuid.append(line.get('uuid'))

        return newLines

    def _compute_price_extra(self, selected_attributes):
        attribute_value = request.env['product.attribute.value'].browse(selected_attributes)
        return sum(attribute_value.mapped('default_extra_price'))

    def _get_order_prices(self, lines):
        amount_untaxed = sum([line.get('price_subtotal') for line in lines])
        amount_total = sum([line.get('price_subtotal_incl') for line in lines])
        return amount_total, amount_untaxed

    # The first part will be the session_id of the order.
    # The second part will be the table_id of the order.
    # Last part the sequence number of the order.
    # INFO: This is allow a maximum of 999 tables and 9999 orders per table, so about ~1M orders per session.
    # Example: 'Self-Order 00001-001-0001'
    def _generate_unique_id(self, pos_session_id, config_id, sequence_number, device_type):
        first_part = "{:05d}".format(int(pos_session_id))
        second_part = "{:03d}".format(int(config_id))
        third_part = "{:04d}".format(int(sequence_number))

        device = "Kiosk" if device_type == "kiosk" else "Self-Order"
        return f"{device} {first_part}-{second_part}-{third_part}"

    def _verify_pos_config(self, access_token):
        """
        Finds the pos.config with the given access_token and returns a record with reduced privileges.
        The record is has no sudo access and is in the context of the record's company and current pos.session's user.
        """
        pos_config_sudo = request.env['pos.config'].sudo().search([('access_token', '=', access_token)], limit=1)
        if not pos_config_sudo or (not pos_config_sudo.self_order_table_mode and not pos_config_sudo.self_order_kiosk) or not pos_config_sudo.has_active_session:
            raise Unauthorized("Invalid access token")
        company = pos_config_sudo.company_id
        user = pos_config_sudo.current_session_id.user_id
        return reduce_privilege(pos_config_sudo, company, user)

    def _verify_authorization(self, access_token, table_identifier):
        """
        Similar to _verify_pos_config but also looks for the restaurant.table of the given identifier.
        The restaurant.table record is also returned with reduced privileges.
        """
        pos_config = self._verify_pos_config(access_token)
        table_sudo = request.env["restaurant.table"].sudo().search([('identifier', '=', table_identifier)], limit=1)

        if not table_sudo and not pos_config.self_order_kiosk:
            raise Unauthorized("Table not found")

        company = pos_config.company_id
        user = pos_config.current_session_id.user_id
        table = reduce_privilege(table_sudo, company, user)
        return pos_config, table
