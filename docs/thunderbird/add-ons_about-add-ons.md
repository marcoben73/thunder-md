> For the complete documentation index, see [llms.txt](https://developer.thunderbird.net/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://developer.thunderbird.net/add-ons/about-add-ons.md).

# Introduction

What you need to know about making add-ons for Thunderbird.

Current Thunderbird add-ons are based on the WebExtension technology, which is also used by many web browsers. Browser vendors usually refer to their add-ons as *WebExtensions.* Thunderbird however has a lot of features not available in Browsers, and add-ons written for Thunderbird will most likely not work in Browsers. They are therefore sometimes referred to as *MailExtensions* instead.

WebExtensions are a collection of files that change the way Thunderbird looks and behaves. They can add user interface elements, alter content, or perform background tasks. Thunderbird add-ons are created using standard JavaScript, CSS and HTML.

<figure><img src="https://1163303201-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-L_nKoWlOPz_rkC_kHdV%2Fuploads%2Fgit-blob-1f6108cc764a849a3f493541c0c2bdce5e15af89%2Fwebext_diagram.png?alt=media" alt="Structure of a MailExtension (a Thunderbird add-on based on WebExtension technology) and how it interacts with Thunderbird."><figcaption><p>Structure of a WebExtension and how it interacts with Thunderbird.</p></figcaption></figure>

Key features of WebExtensions:

* They use stable APIs and do not need to be updated when a new version of Thunderbird is released.
* They use a permission mechanism that requires users to confirm any permission requested by add-ons before they can be installed. These permission requests enable users to know what an add-on is actually doing.
* Advanced add-on developers (with in-depth knowledge of Thunderbird source code) can extend the current available set of APIs by creating their own APIs and ship them with the add-ons. These APIs are called [Experiments](/add-ons/mailextensions.md#experiment-apis), and they interact directly with Thunderbird's internal APIs, allowing add-ons to use additional features not yet available via built-in WebExtension APIs.

An add-on can either be an **extension** (adding functionality or changing the way Thunderbird works) or a **theme** (changing the way Thunderbird looks).

## Getting Started

There's a lot of information out there when it comes to add-on development, and finding the most relevant one can be time-consuming. We have therefore put together a tutorial that explains step by step how to create your first extension for Thunderbird:

{% content-ref url="/pages/-LacNER74p3iflqjbg74" %}
[A "Hello World" Extension Tutorial](/add-ons/hello-world-add-on.md)
{% endcontent-ref %}

## Add-On Guides

For more detailed information on the two add-on types supported by Thunderbird, see their respective guides:

{% content-ref url="/pages/-MJ6xtDSW60GvgKtAgsG" %}
[A Guide to Extensions](/add-ons/mailextensions.md)
{% endcontent-ref %}

{% content-ref url="/pages/-Lk5PmfF8C876zhlVjRW" %}
[A Guide to Themes](/add-ons/web-extension-themes.md)
{% endcontent-ref %}
