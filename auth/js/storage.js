const Memory = {

    set(key,value){

        sessionStorage.setItem(
            key,
            JSON.stringify(value)
        );

    },

    get(key){

        const value=sessionStorage.getItem(key);

        return value
            ?JSON.parse(value)
            :null;

    },

    remove(key){

        sessionStorage.removeItem(key);

    },

    clear(){

        sessionStorage.clear();

    },

    // A mobile browser/WebView may discard sessionStorage while moving
    // between auth pages or after the OS suspends the tab. Keep the short
    // OTP handoff in localStorage as a small, explicit fallback.
    setPersistent(key, value){
        localStorage.setItem(`notely_${key}`, JSON.stringify(value));
    },

    getPersistent(key){
        const value = localStorage.getItem(`notely_${key}`);
        if (!value) return null;
        try { return JSON.parse(value); } catch { return null; }
    },

    removePersistent(key){
        localStorage.removeItem(`notely_${key}`);
    }

};
