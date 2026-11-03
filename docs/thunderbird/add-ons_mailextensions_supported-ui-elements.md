> For the complete documentation index, see [llms.txt](https://developer.thunderbird.net/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://developer.thunderbird.net/add-ons/mailextensions/supported-ui-elements.md).

# Supported UI Elements

Descriptions and examples of MailExtension APIs to interact with Thunderbird's user interface.

## Browser Action

A browser action adds a button to Thunderbird's main toolbar:

![](https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-955e8cb7a492276c9acc1589bc81293dd6599219%2Fbrowseraction.png?alt=media)

It is controlled by the `browser_action` manifest key in the extension's `manifest.json` file:

```javascript
"browser_action": {
    "default_title": "Restart",
    "default_icon" : "restart.png",
    "default_popup": "browser_popup.html"
},
```

If a `default_popup` is defined, a popup will be opened and the defined html page will be loaded, when the button is clicked. Additionally, you can use the [browserAction](https://webextension-api.thunderbird.net/en/mv2/browserAction.html) API in your background script to interact with the button to modify *badge text*, *icon*, *title* or its *enabled state*.

If the action button is defined as a [menu typed action button](https://github.com/thunderbird/webext-examples/tree/master/manifest_v2/menuActionButton), it will open a drop-down menu when clicked.

**Note:** The `browserAction` API has been renamed to `action` in [Manifest V3](https://webextension-api.thunderbird.net/en/mv3/action.html).

## Compose Action

A compose action adds a button to the toolbar of the composer window:

![](https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-4a7b1f4a19607a9ab22a337db34dbf9d61f6fe89%2Fcomposeaction.png?alt=media)

It is controlled by `compose_action` manifest key in the extension's `manifest.json` file:

```javascript
"compose_action": {
    "default_title": "Expand lists",
    "default_icon" : "lists.png",
    "default_popup": "compose_popup.html"
},
```

If a `default_popup` is defined, a popup will be opened and the defined html page will be loaded, when the button is clicked. Additionally, you can use the [composeAction](https://webextension-api.thunderbird.net/en/mv2/composeAction.html) API in your background script to interact with the button to modify *badge text*, *icon*, *title* or its *enabled state*.

If the action button is defined as a [menu typed action button](https://github.com/thunderbird/webext-examples/tree/master/manifest_v2/menuActionButton), it will open a drop-down menu when clicked.

## Message Display Action

A message display action adds a button to the toolbar of the message view window:

![](https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-22c40867b644c52eeb889493ac3e49159d0b0980%2Fmda.png?alt=media)

It is controlled by the `message_display_action` manifest key in the extension's `manifest.json` file:

```javascript
"message_display_action": {
    "default_title": "Copy Patch",
    "default_icon" : "patch.png",
    "default_popup": "message_popup.html"
    },
```

If a `default_popup` is defined, a popup will be opened and the defined html page will be loaded, when the button is clicked. Additionally, you can use the [messageDisplayAction](https://webextension-api.thunderbird.net/en/mv2/messageDisplayAction.html) API in your background script to interact with the button to modify *badge text*, *icon*, *title* or its *enabled state*.

If the action button is defined as a [menu typed action button](https://github.com/thunderbird/webext-examples/tree/master/manifest_v2/menuActionButton), it will open a drop-down menu when clicked.

## CloudFile Provider Configuration

Thunderbird supports cloud providers to upload large attachments to a server, instead of attaching them directly to the email. Extensions can register such cloud providers using the [CloudFile](https://webextension-api.thunderbird.net/en/mv2/cloudFile.html) API. These providers can be managed in Thunderbird's Composition options:

![](https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-ad6cfb9dd7a13dd650eaf51247f91ae0d064651e%2Fcloud.png?alt=media)

## Menu Items

The [menus](https://webextension-api.thunderbird.net/en/mv2/menus.html) API allows modifying Thunderbird's menus by adding or overriding menu items. The menu items can be added to different menus based on the provided `context` type. Examples can be found in our [example repository](https://github.com/thunderbird/webext-examples/tree/master/manifest_v2/menu).

Thunderbird menus are accessible through the following context types:

<table><thead><tr><th width="372.3333333333333">Context</th><th width="369">Description</th></tr></thead><tbody><tr><td><code>all</code></td><td>Add menu entries to all supported contexts, excluding <code>tab</code> and <code>tools_menu</code>.</td></tr><tr><td><code>all_message_attachments</code></td><td>Add entries to the context menu of the summary area of message attachments.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-445d7d68f7ff25142c3f5ed68720c8d37f7ecc1e%2Fall_message_attachments.png?alt=media" alt=""><br><br>If the message has only one attachment, then the <code>message_attachments</code> context is used instead.</td></tr><tr><td><code>action</code>,<br><code>browser_action</code>, <code>compose_action</code> , <code>message_display_action</code><br><br>N<strong>ote</strong>: <code>browser_action</code> is available in Manifest V2 and <code>action</code> is available in<br>Manifest V3.</td><td>Add entries to the context menu of action buttons.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-766cc11b2550030c0fc4b6095fad6941f2d4df31%2Fbrowser_action_context.png?alt=media" alt=""></td></tr><tr><td><code>action_menu</code>,<br><code>browser_action_menu</code>, <code>compose_action_menu</code>, <code>message_display_action_menu</code>,<br><br><strong>Note</strong>: <code>browser_action_menu</code> is available in Manifest V2 and <code>action_menu</code> is available in Manifest V3.</td><td><p>Add entries to the drop-down menu of <a href="https://github.com/thunderbird/webext-examples/tree/master/manifest_v2/menuActionButton">menu typed action buttons</a>.</p><p><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-cb74b70fc692ed95ff3c3bd7275eafaf28940e6a%2Fimage.png?alt=media" alt="" data-size="original"></p></td></tr><tr><td><code>compose_attachments</code></td><td>Add entries to the context menu of attachments in the compose window.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-9ca575ab669f1b686834c89cdb69476bd675177f%2Fcompose_attachments_context.png?alt=media" alt=""></td></tr><tr><td><code>editable</code>,<br><code>password</code></td><td><p>Add entries to the context menu of text/password input fields in WebExtension windows, web tabs or message display tabs.<br></p><p>Limited to content areas.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-75ffd68ed2deda301f6dc767affdd3b80c596f40%2Feditable.png?alt=media" alt="" data-size="original"></p></td></tr><tr><td><code>folder_pane</code></td><td>Add entries to the context menu of the folder pane of mail tabs.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-e3c18fcb99c779deae077c2d0b84466d678a7964%2Ffolder_pane.png?alt=media" alt="" data-size="original"></td></tr><tr><td><code>image</code>,<br><code>audio</code>,<br><code>video</code></td><td>Add entries to the context menu of embedded images, audio or video players in WebExtension windows, web tabs or message display tabs.<br><br>Limited to content areas.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-728e5f77d73f15bf6e01cfa1ef21f1d446848ffb%2Fimage.png?alt=media" alt="" data-size="original"></td></tr><tr><td><code>link</code></td><td><p>Add entries to the context menu of links in WebExtension windows, in web tabs or in message display tabs.</p><p><br>Limited to content areas.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-5f1b405cbbe14b7e9c516e62ad05cd6927a5d574%2Flink.png?alt=media" alt="" data-size="original"></p></td></tr><tr><td><code>message_attachments</code></td><td>Add entries to the context menu of attachments of messages.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-d5f41f6c3e6fdb11ac197fd4e1e9445c66675b81%2Fmessage_attachments_context.png?alt=media" alt=""></td></tr><tr><td><code>message_list</code></td><td>Add entries to the context menu of the message list area of a mail tab.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-cf62de27f221cf0a19b64ef289b2350c4c1bd1c8%2Fmessage_list.png?alt=media" alt="" data-size="original"></td></tr><tr><td><code>page</code>,<br><code>frame</code></td><td><p>Add entries to the context menu of WebExtension windows, web tabs or message display tabs, if none of the other content contexts apply (link, selection, image, audio, video, editable, password).</p><p><br>If the page is loaded inside a frame, the <code>frame</code> context applies, otherwise the <code>page</code> context.<br><br>Limited to content areas.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-a66a42df62a35438519439bca72e04d5df623f8c%2Fpage.png?alt=media" alt="" data-size="original"></p></td></tr><tr><td><code>selection</code></td><td><p>Add entries to the context menu in WebExtension windows, web tabs or message display tabs, if any text has been selected.<br></p><p>Limited to content areas.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-5510eeb94e8346cd0ac775453bdac9fbbd2be13e%2Fselection.png?alt=media" alt="" data-size="original"></p></td></tr><tr><td><code>tab</code></td><td><p>Add entries to the context menu of tab ribbons.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-8333a0c637451f29acd3d515f4290c6aeec92e11%2Ftab.png?alt=media" alt=""></p><p>The <code>tab</code> context can also be used to override the context menu of content pages (action popups or content tabs).</p><p><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-cf59f157da5fdf98116ae972ef3173eb5269dad6%2Fimage.png?alt=media" alt="" data-size="original"></p><p>See the <a href="https://github.com/thunderbird/webext-examples/tree/master/manifest_v2/menu">menu example</a> for more details.</p></td></tr><tr><td><code>tools_menu</code></td><td>Add entries to Thunderbird's tools menu.<br><br><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-fc763dd576e46b0fb8336b2879a654ff5fffeb7c%2Fimage.png?alt=media" alt=""></td></tr></tbody></table>
