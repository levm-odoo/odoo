declare module "mock_models" {
    import { LivechatChannel as LivechatChannel2 } from "../im_livechat_channel";
    import { ResLang as ResLang2 } from "../res_lang";

    export interface LivechatChannel extends LivechatChannel2 {}
    export interface ResLang extends ResLang2 {}

    export interface Models {
        "im_livechat.channel": LivechatChannel,
        "res.lang": ResLang,
    }
}
