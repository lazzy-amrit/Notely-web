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

    }

};