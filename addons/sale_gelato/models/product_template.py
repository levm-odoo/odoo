# Part of Odoo. See LICENSE file for full copyright and licensing details.
import json
import re

from odoo import models, fields, api, Command, _
from odoo.exceptions import ValidationError
from odoo.osv import expression

from odoo.addons.sale_gelato.utils import make_gelato_request


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    gelato_product_ref = fields.Char(
        string="Gelato Product Reference",
        compute='_compute_gelato_product_ref',
        inverse='_set_gelato_product_ref',
    )
    gelato_template_ref = fields.Char(
        string="Gelato Template Reference",
        help="Synchronie to fetch variants from Gelato"
    )
    gelato_image_ids = fields.One2many(
        string="Print Images", inverse_name='res_id', comodel_name='product.document', readonly=True
    )

    @api.constrains('gelato_product_ref', 'gelato_template_ref')
    def _check_gelato_image(self): #it checks the constraint after creating product_document
        for record in self:
            if record.gelato_template_ref or record.gelato_product_ref or record.product_variant_id.gelato_product_ref:
                for image in record.gelato_image_ids:
                    if not image.image_src:
                        raise ValidationError(_("You must provide an image template design for the"
                                                " Gelato product."))

    @api.depends('product_variant_ids.gelato_product_ref')
    def _compute_gelato_product_ref(self):
        self._compute_template_field_from_variant_field('gelato_product_ref')

    def _set_gelato_product_ref(self):
        self._set_product_variant_field('gelato_product_ref')

    def _get_related_fields_variant_template(self):
        related_variants = super()._get_related_fields_variant_template()
        related_variants.append('gelato_product_ref')
        return related_variants

    def action_create_product_variants_from_gelato_template(self):
        """
            Make a request to Gelato to pass all the variants of provided template and create
            attributes corresponding to the variants, which will automatically create existing
            variants and delete variants that are n0t available in gelato.
        """

        url = f'https://ecommerce.gelatoapis.com/v1/templates/{self.gelato_template_ref}'

        response = make_gelato_request(self.env.company, url=url, method='GET')
        if response.status_code in [401,403]:
            raise ValidationError(_(
                'You don\'t have access to this template. Please check your credentials.'
            ))
        if response.status_code == 404:
            raise ValidationError("Gelato Template Reference is incorrect")
        data = response.json()

        self.description_sale = re.sub('<[^<]+?>', '', data['description'])

        if len(data['variants']) == 1:
            self.gelato_product_ref = data['variants'][0]['productUid']

        else:
            for variant_data in data['variants']:
                attribute_value_ids = []
                #maybe throw attribute search and creation in seprate function
                for attribute_data in variant_data['variantOptions']:
                    # Search if there is an existing attribute with proper variant creation, if not
                    # new attribute is created.
                    attribute = self.env['product.attribute'].search(
                        [('name', '=', attribute_data['name']), ('create_variant','=','always')]
                    )
                    if not attribute:
                        attribute = self.env['product.attribute'].create({
                            'name': attribute_data['name']
                        })

                    #Search if attribute value exists in attribute, if not, new attribute value is
                    # added to the corresponding attribute.
                    attribute_value = self.env['product.attribute.value'].search([
                        ('name', '=', attribute_data['value']),
                        ('attribute_id', '=', attribute.id)
                    ], limit=1)
                    if not attribute_value:
                        attribute_value = self.env['product.attribute.value'].create({
                            'name': attribute_data['value'],
                            'attribute_id': attribute.id
                        })
                    attribute_value_ids.append(attribute_value.id)

                    # Check if product template has the attribute, if not then add attribute, which
                    # will result in creating new variant(s).
                    product_template_attribute_line = self.env['product.template.attribute.line'].search([
                        ('product_tmpl_id', '=', self.id),
                        ('attribute_id', '=', attribute.id)
                    ], limit=1)
                    if not product_template_attribute_line:
                        self.env['product.template.attribute.line'].create({
                            'product_tmpl_id': self.id,
                            'attribute_id': attribute.id,
                            'value_ids': [Command.link(attribute_value.id)]
                        })
                    else:
                        product_template_attribute_line.value_ids = [Command.link(attribute_value.id)]

                matching_variant = self.env['product.product'].search(
                    [('product_tmpl_id', '=', self.id)]
                )
                current_product = matching_variant.filtered(
                    lambda v: set(v.product_template_attribute_value_ids.product_attribute_value_id.ids) == set(attribute_value_ids)
                ) # this doen't find the corresponding variant attribute ids

                gelato_ref = variant_data['productUid']
                current_product[0].gelato_product_ref = gelato_ref

            variants_without_gelato = self.env['product.product'].search([
                ('product_tmpl_id', '=', self.id),
                ('gelato_product_ref', '=', False)
            ])
            variants_without_gelato.unlink()

        self.create_image_placement(data['variants'][0]['imagePlaceholders'])

    def create_image_placement(self, placement_list):
        # Gelato might send image placement that is named 1 or front but won't accept is when
        # placing order, instead, in place of those names value 'default' is required
        for placement in placement_list:
            if placement['printArea'].lower() in ('1', 'front'):
                placement['printArea'] = 'default'
            #gelato only accepts each placement one time, if during synchronization 2 placements
            # with the same name are sent, we only use one of them
            image = self.env['product.document'].search([
                ('name', '=', placement['printArea'].lower()),
                ('is_gelato', '=', True),
                ('res_id', '=', self.id),
                ('res_model', '=', 'product.template'),
            ])
            if not image:
                image = self.env['product.document'].create({
                    'name': placement['printArea'].lower(),
                    'is_gelato': True,
                    'res_id': self.id,
                    'res_model': 'product.template',
                })
                self.gelato_image_ids = [Command.link(image.id)]
        return

    def get_product_document_domain(self):
        domain = super().get_product_document_domain()
        return expression.AND([domain, [('is_gelato', '=', False)]])

