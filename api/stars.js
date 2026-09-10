// ------------------------------------------------------------------
// api/stars.js — wraps Services/stars.py
//
// Stars are PERSONAL. Starring a class/subject/note only pins it to
// YOUR Notes tab; it changes nothing for anyone else, and unstarring
// never deletes the underlying item.
// ------------------------------------------------------------------

const StarsApi = {
    // GET /stars -> {classes:[...], subjects:[...], notes:[...]}
    list() {
        return Api.get("/stars");
    },

    // POST /stars {kind: "class"|"subject"|"note", ref_id}
    add(kind, refId) {
        return Api.post("/stars", { kind, ref_id: refId });
    },

    // DELETE /stars?kind=&ref_id=
    remove(kind, refId) {
        return Api.delete(`/stars?kind=${encodeURIComponent(kind)}&ref_id=${refId}`);
    },

    toggle(kind, refId, isStarred) {
        return isStarred ? StarsApi.remove(kind, refId) : StarsApi.add(kind, refId);
    },
};

window.StarsApi = StarsApi;
