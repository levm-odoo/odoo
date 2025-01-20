import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("crm_livechat.see_chat_from_lead", {
    steps: () => [
        {
            trigger:
                ".o_field_text[name='name']:contains(I'd like to know more about the CRM application.)",
        },
        {
            trigger: "button:contains(View Chat)",
            run: "click",
        },
        {
            trigger: ".o-mail-Discuss-threadName[title='Visitor']",
        },
        {
            trigger: ".o-discuss-ChannelMember:contains(Create lead bot)",
        },
    ],
});
