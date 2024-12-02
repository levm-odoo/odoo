# Part of Odoo. See LICENSE file for full copyright and licensing details.

from ast import literal_eval

from odoo import fields, models, api


class HrApplicant(models.Model):
    _inherit = "hr.applicant"

    applicant_skill_ids = fields.One2many(
        "hr.applicant.skill", "applicant_id", string="Skills", copy=True
    )
    skill_ids = fields.Many2many("hr.skill", compute="_compute_skill_ids", store=True)
    matching_skill_ids = fields.Many2many(
        comodel_name="hr.skill",
        string="Matching Skills",
        compute="_compute_matching_skill_ids",
    )
    missing_skill_ids = fields.Many2many(
        comodel_name="hr.skill",
        string="Missing Skills",
        compute="_compute_matching_skill_ids",
    )
    matching_score = fields.Float(
        string="Matching Score(%)", compute="_compute_matching_skill_ids"
    )

    @api.depends("applicant_skill_ids.skill_id")
    def _compute_skill_ids(self):
        for applicant in self:
            applicant.skill_ids = applicant.applicant_skill_ids.skill_id

    @api.depends_context("active_id")
    @api.depends("skill_ids")
    def _compute_matching_skill_ids(self):
        job_id = self.env.context.get("active_id")
        if not job_id:
            self.matching_skill_ids = False
            self.missing_skill_ids = False
            self.matching_score = 0
        else:
            for applicant in self:
                job_skills = self.env["hr.job"].browse(job_id).skill_ids
                applicant.matching_skill_ids = job_skills & applicant.skill_ids
                applicant.missing_skill_ids = job_skills - applicant.skill_ids
                applicant.matching_score = (
                    (len(applicant.matching_skill_ids) / len(job_skills)) * 100
                    if job_skills
                    else 0
                )

    def _get_employee_create_vals(self):
        vals = super()._get_employee_create_vals()
        vals["employee_skill_ids"] = [
            (
                0,
                0,
                {
                    "skill_id": applicant_skill.skill_id.id,
                    "skill_level_id": applicant_skill.skill_level_id.id,
                    "skill_type_id": applicant_skill.skill_type_id.id,
                },
            )
            for applicant_skill in self.applicant_skill_ids
        ]
        return vals

    def action_add_to_job(self):
        self.with_context(just_moved=True).write(
            {
                "job_id": self.env["hr.job"]
                .browse(self.env.context.get("active_id"))
                .id,
                "stage_id": self.env.ref("hr_recruitment.stage_job0"),
            }
        )
        action = self.env["ir.actions.actions"]._for_xml_id(
            "hr_recruitment.action_hr_job_applications"
        )
        action["context"] = literal_eval(
            action["context"].replace("active_id", str(self.job_id.id))
        )
        return action

    def write(self, vals):
        if 'applicant_skill_ids' in vals and self.pool_applicant_id and (not self.is_pool_applicant):
            for applicant in self:
                applicant.pool_applicant_id.write(vals)
                # TODO: Figure out a way to allow the skils to be updated
        res = super().write(vals)
        return res
