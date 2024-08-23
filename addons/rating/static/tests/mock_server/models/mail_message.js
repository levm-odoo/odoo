import { models } from "@web/../tests/web_test_helpers";

export class MailMessage extends models.ServerModel {
    _name = "mail.message";

    message_format() {
        const formattedMessages = super.message_format(...arguments);
        for (const message of formattedMessages) {
            const [rating] = this.env["rating.rating"]._filter([["message_id", "=", message.id]]);
            if (rating) {
                message["rating"] = {
                    id: rating.id,
                    ratingImageUrl: rating.rating_image_url,
                    ratingText: rating.rating_text,
                };
            }
        }
        return formattedMessages;
    }
}
