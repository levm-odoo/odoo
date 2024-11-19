# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ProductProduct(models.Model):
    _inherit = "product.product"

    product_catalog_product_is_in_repair = fields.Boolean(
        compute='_compute_product_is_in_repair',
        search='_search_product_is_in_repair',
    )

    def _compute_product_is_in_repair(self):
        # Just to enable the _search method
        self.product_catalog_product_is_in_repair = False

    def _search_product_is_in_repair(self, operator, value):
        if operator != 'in':
            raise NotImplementedError
        product_ids = self.env['repair.order'].search([
            ('id', 'in', [self.env.context.get('order_id', '')]),
        ]).move_ids.product_id.ids
        return [('id', operator, product_ids)]

    def _count_returned_sn_products_domain(self, sn_lot, or_domains):
        or_domains.append([
                ('move_id.repair_line_type', 'in', ['remove', 'recycle']),
                ('location_dest_usage', '=', 'internal'),
        ])
        return super()._count_returned_sn_products_domain(sn_lot, or_domains)


class ProductTemplate(models.Model):
    _inherit = "product.template"

    create_repair = fields.Boolean('Create Repair', help="Create a linked Repair Order on Sale Order confirmation of this product.", groups='stock.group_stock_user')
