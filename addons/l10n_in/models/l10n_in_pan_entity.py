from stdnum.in_ import pan
from odoo import _, api, fields, models
from odoo.exceptions import ValidationError, UserError


class L10nInPanEntity(models.Model):
    _name = 'l10n_in.pan.entity'
    _description = 'Indian PAN Entity'

    name = fields.Char(string="PAN Number")
    entity_type = fields.Selection([
        ('c', 'Company'),
        ('p', 'Individual'),
        ('h', 'Hindu Undivided Family'),
        ('f', 'Firms'),
        ('t', 'Association of Persons for a Trust'),
        ('a', 'Association of Persons'),
        ('b', 'Body of Individuals'),
        ('g', 'Government'),
        ('l', 'Local Authority'),
        ('j', 'Artificial Judicial Person'),
        ('k', 'Krish (Trust Krish)'),
    ], compute='_compute_entity_type', readonly=True, store=True)

    _name_uniq = models.Constraint(
        'unique (name)',
        'A PAN Entity with same PAN Number already exists.',
    )

    @api.constrains('name')
    def _check_name(self):
        for record in self:
            if record.name and not pan.is_valid(record.name):
                raise ValidationError(_("The entered PAN seems invalid. Please enter a valid PAN."))

    @api.depends('name')
    def _compute_entity_type(self):
        for record in self:
            record.name = record.name.upper()
            if pan.is_valid(self.name):
                record.entity_type = record.name[3].lower()
            else:
                record.entity_type = False
