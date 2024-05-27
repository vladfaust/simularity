### Empty Writer Responses

In Simulation `#r5yJ5y8UJKjuxrrUPZXVF`, writer responds with a blank message, meaning that it generated either a EOS (never seen that) or a newline token immeditely.

![](../img/issues/02-empty-writer-responses/image-1.png)

Regeneration helps.

![](../img/issues/02-empty-writer-responses/image-2.png)

Possible fix: ban the newline token in the beginning.
Should log or panic if `\n` or `EOS` is predicted immediately.

Died again at regeneration #4.

Now it returns all empty responses:

![](../img/issues/02-empty-writer-responses/image-3.png)
