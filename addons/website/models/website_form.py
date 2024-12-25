# Part of Odoo. See LICENSE file for full copyright and licensing details.

from ast import literal_eval

from odoo import models, fields, api, SUPERUSER_ID
from odoo.http import request
from odoo.osv import expression


class Website(models.Model):
    _inherit = 'website'

    def _website_form_last_record(self):
        if request and request.session.get('form_builder_model_model'):
            return request.env[request.session['form_builder_model_model']].browse(request.session['form_builder_id'])
        return False


class IrModel(models.Model):
    _inherit = 'ir.model'

    website_form_access = fields.Boolean('Allowed to use in forms', help='Enable the form builder feature for this model.')
    website_form_default_field_id = fields.Many2one('ir.model.fields', 'Field for custom form data', domain="[('model', '=', model), ('ttype', '=', 'text')]", help="Specify the field which will contain meta and custom form fields datas.")
    website_form_label = fields.Char("Label for form action", help="Form action label. Ex: crm.lead could be 'Send an e-mail' and project.issue could be 'Create an Issue'.")
    website_form_key = fields.Char(help='Used in FormBuilder Registry')

    @api.model
    def get_compatible_form_models(self):
        if not self.env.user.has_group('website.group_website_restricted_editor'):
            return []
        return self.sudo().search_read(
            [('website_form_access', '=', True)],
            ['id', 'model', 'name', 'website_form_label', 'website_form_key'],
        )


class IrModelFields(models.Model):
    _inherit = 'ir.model.fields'

    def has_whitelist_access(self):
        """ Allow website designer to make fields whitelisted. """
        return (
            super().has_whitelist_access
            or self.env.user.has_group('website.group_website_designer')
        )
