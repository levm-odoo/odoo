# Part of Odoo. See LICENSE file for full copyright and licensing details.

from ast import literal_eval

from odoo import models, api, SUPERUSER_ID
from odoo.osv import expression

class IrModel(models.Model):
    _inherit = 'ir.model'

    def _get_form_writable_fields(self, property_origins=None):
        """
        Restriction of "authorized fields" (fields which can be used in the
        form builders) to fields which have actually been opted into form
        builders and are writable. By default no field is writable by the
        form builder.
        """
        if self.model == "mail.mail":
            included = {'email_from', 'email_to', 'email_cc', 'email_bcc', 'body', 'reply_to', 'subject'}
        else:
            included = {
                field.name
                for field in self.env['ir.model.fields'].sudo().search([
                    ('model_id', '=', self.id),
                    ('frontend_form_blacklisted', '=', False)
                ])
            }
        return {
            k: v for k, v in self.get_authorized_fields(self.model, property_origins).items()
            if k in included or '_property' in v and v['_property']['field'] in included
        }

    @api.model
    def get_authorized_fields(self, model_name, property_origins):
        """ Return the fields of the given model name as a mapping like method `fields_get`. """
        model = self.env[model_name]
        fields_get = model.fields_get()

        for val in model._inherits.values():
            fields_get.pop(val, None)

        # Unrequire fields with default values
        default_values = model.with_user(SUPERUSER_ID).default_get(list(fields_get))
        for field in [f for f in fields_get if f in default_values]:
            fields_get[field]['required'] = False

        # Remove readonly, JSON, and magic fields
        # Remove string domains which are supposed to be evaluated
        # (e.g. "[('product_id', '=', product_id)]")
        # Expand properties fields
        for field in list(fields_get):
            if 'domain' in fields_get[field] and isinstance(fields_get[field]['domain'], str):
                del fields_get[field]['domain']
            if fields_get[field].get('readonly') or field in models.MAGIC_COLUMNS or \
                    fields_get[field]['type'] in ('many2one_reference', 'json'):
                del fields_get[field]
            elif fields_get[field]['type'] == 'properties':
                property_field = fields_get[field]
                del fields_get[field]
                if property_origins:
                    # Add property pseudo-fields
                    # The properties of a property field are defined in a
                    # definition record (e.g. properties inside a project.task
                    # are defined inside its related project.project)
                    definition_record = property_field['definition_record']
                    if definition_record in property_origins:
                        definition_record_field = property_field['definition_record_field']
                        relation_field = fields_get[definition_record]
                        definition_model = self.env[relation_field['relation']]
                        if not property_origins[definition_record].isdigit():
                            # Do not fail on malformed forms.
                            continue
                        definition_record = definition_model.browse(int(property_origins[definition_record]))
                        properties_definitions = definition_record[definition_record_field]
                        for property_definition in properties_definitions:
                            if ((
                                property_definition['type'] in ['many2one', 'many2many']
                                and 'comodel' not in property_definition
                            ) or (
                                property_definition['type'] == 'selection'
                                and not property_definition['selection']
                            ) or (
                                property_definition['type'] == 'tags'
                                and not property_definition['tags']
                            ) or (property_definition['type'] == 'separator')):
                                # Ignore non-fully defined properties
                                continue
                            property_definition['_property'] = {
                                'field': field,
                            }
                            property_definition['required'] = False
                            if 'domain' in property_definition and isinstance(property_definition['domain'], str):
                                property_definition['domain'] = literal_eval(property_definition['domain'])
                                try:
                                    property_definition['domain'] = expression.normalize_domain(property_definition['domain'])
                                except Exception:
                                    # Ignore non-fully defined properties
                                    continue
                            fields_get[property_definition.get('name')] = property_definition

        return fields_get
