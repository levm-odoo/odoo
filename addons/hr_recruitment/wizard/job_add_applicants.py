from odoo import fields, models


class JobAddApplicants(models.TransientModel):
    _name = "job.add.applicants"
    _description = "Add applicants to a job"

    applicant_ids = fields.Many2many(
        "hr.applicant", string="Applications", required=True
    )
    job_ids = fields.Many2many("hr.job", string="Job Positions", required=True)

    def action_add_applicants_to_job(self):
        applicant_data = self.applicant_ids.copy_data()
        ne_applicants = self.env['hr.applicant'].create([
            {
                **applicant,
                'job_id': job.id,
                'talent_pool_ids': False,
            }
            for applicant in applicant_data
            for job in self.job_ids
        ])

        if len(self.job_ids) == 1 and len(self.applicant_ids) == 1:
            return {
                "type": "ir.actions.act_window",
                "res_model": "hr.applicant",
                "view_mode": "form",
                "target": "current",
                "res_id": ne_applicants.id,
            }
