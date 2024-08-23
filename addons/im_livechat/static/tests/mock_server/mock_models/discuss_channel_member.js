import { models } from "@web/../tests/web_test_helpers";

export class DiscussChannelMember extends models.ServerModel {
    _name = "discuss.channel.member";

    /**
     * @override
     * @type {typeof mailModels.DiscussChannelMember["prototype"]["_get_partner_data"]}
     */
    _get_partner_data(ids) {
        /** @type {import("mock_models").DiscussChannel} */
        const DiscussChannel = this.env["discuss.channel"];
        /** @type {import("mock_models").ResCountry} */
        const ResCountry = this.env["res.country"];
        /** @type {import("mock_models").ResPartner} */
        const ResPartner = this.env["res.partner"];

        const [member] = this.browse(ids);
        const [channel] = DiscussChannel.browse(member.channel_id);
        const [partner] = ResPartner.browse(member.partner_id);
        if (channel.channel_type === "livechat") {
            const data = {
                id: partner.id,
                is_public: partner.is_public,
                type: "partner",
            };
            if (partner.user_livechat_username) {
                data["user_livechat_username"] = partner.user_livechat_username;
            } else {
                data["name"] = partner.name;
            }
            if (!partner.is_public) {
                const [country] = ResCountry.browse(partner.country_id);
                data["country"] = country
                    ? {
                          code: country.code,
                          id: country.id,
                          name: country.name,
                      }
                    : false;
            }
            data["write_date"] = partner.write_date;
            return data;
        }
        return super._get_partner_data(ids);
    }
}
