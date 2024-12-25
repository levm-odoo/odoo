# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api


class IrModelFields(models.Model):
    """ fields configuration for frontend """
    _inherit = 'ir.model.fields'

    def init(self):
        # set all existing unset frontend_form_blacklisted fields to ``true``
        #  (so that we can use it as a whitelist rather than a blacklist)
        self._cr.execute('UPDATE ir_model_fields'
                         ' SET frontend_form_blacklisted=true'
                         ' WHERE frontend_form_blacklisted IS NULL')
        # add an SQL-level default value on frontend_form_blacklisted to that
        # pure-SQL ir.model.field creations (e.g. in _reflect) generate
        # the right default value for a whitelist (aka fields should be
        # blacklisted by default)
        self._cr.execute('ALTER TABLE ir_model_fields '
                         ' ALTER COLUMN frontend_form_blacklisted SET DEFAULT true')

    frontend_form_blacklisted = fields.Boolean(
        'Blacklisted in frontend forms', default=True, index=True,
        help='Blacklist this field for frontend forms'
    )

    @api.model
    def formbuilder_whitelist(self, model, fields):
        """
        :param str model: name of the model on which to whitelist fields
        :param list(str) fields: list of fields to whitelist on the model
        :return: nothing of import
        """
        # postgres does *not* like ``in [EMPTY TUPLE]`` queries
        if not fields:
            return False

        if not self.has_whitelist_access():
            return False

        unexisting_fields = [field for field in fields if field not in self.env[model]._fields.keys()]
        if unexisting_fields:
            raise ValueError("Unable to whitelist field(s) %r for model %r." % (unexisting_fields, model))

        # the ORM only allows writing on custom fields and will trigger a
        # registry reload once that's happened. We want to be able to
        # whitelist non-custom fields and the registry reload absolutely
        # isn't desirable, so go with a method and raw SQL
        self.env.cr.execute(
            "UPDATE ir_model_fields"
            " SET frontend_form_blacklisted=false"
            " WHERE model=%s AND name in %s", (model, tuple(fields)))
        return True

    @api.model
    def has_whitelist_access(self):
        """ Only admins and super user are allowed to make fields whitelisted. """
        return self.env.user._is_admin() or self.env.su
