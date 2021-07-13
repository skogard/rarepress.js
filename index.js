/*****************************************
*
* - token apis
*
*   /token/init
*   /token/build
*   /token/send
*
* - trade apis
*
*   /trade/build
*   /trade/send
*
* - ipfs apis
*
*   /ipfs/add
*   /ipfs/import
*
*****************************************/
(() => {
  class Thing {
    constructor(o) {
      this.host = o.host
      this.account = o.account
    }
    async sign (message) {
      try {
        let res = await ethereum.request(
          {
            method: 'eth_signTypedData_v4',
            params: [ this.account, JSON.stringify(message) ],
            from: this.account
          }
        )
        return res;
      } catch (e) {
        alert(e.message)
      }
    }
    async request(path, o) {
      let r = await fetch(this.host + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(o)
      }).then((res) => {
        return res.json()
      })
      return r
    }
  }
  class Token extends Thing {
    async init(type) {
      let tokenIdURL = await this.request("/token/init", {
        type: type,
        address: this.account
      }).then((res) => {
        return res.url
      })
      let tokenId = await fetch(tokenIdURL).then((res) => {
        return res.json()
      }).then((res) => { return res.tokenId })
      return tokenId
    }
    build (body) {
      let type = (body.supply && body.supply > 1 ? "ERC1155": "ERC721")
      if (!body.creators) {
        body.creators = [{ account: this.account, value: 10000 }]
      }
      return this.request("/token/build", { body, type })
    }
    send (body, sig) {
      return this.request("/token/send", { body, sig })
    }
    async create (body) {
      let type = (body.supply && body.supply > 1 ? "ERC1155": "ERC721")
      let tokenId = await this.init(type)
      body.tokenId = tokenId
      if (!body.metadata.name || body.metadata.name.length === 0) body.metadata.name = ""
      if (!body.metadata.description || body.metadata.description.length === 0) body.metadata.description = ""
      if (!body.metadata.image || body.metadata.image.length === 0) body.metadata.image = ""
      if (body.tokenId) {
        let builtToken = await this.build(body)
        let sig = await this.sign(builtToken)
        let sent = await this.send(builtToken, sig)
        return sent
      } else {
        alert("name, description, and image attributes must be set")
      }
    }
  }
  /*********************
  * Virtual IPFS
  *********************/
  class VIPFS extends Thing {
    async upload(blob) {
      let fd = new FormData()
      fd.append('file', blob)
      let response = await fetch(this.host + "/ipfs/add", {
        method: "POST",
        body: fd
      }).then((res) => {
        return res.json()
      })
      return response.cid
    }
    async import(url) {
      let response = await this.request("/ipfs/import", { url })
      if (response.error) {
        throw new Error(response.error)
      } else {
        return response.cid
      }
    }
    async folder(mapping) {
      /************************
      * mapping := {
      *   <path1>: <cid1>,
      *   <path2>: <cid2>,
      *   ...
      * }
      ************************/
      let response = await this.request("/ipfs/folder", mapping)
      if (response.error) {
        throw new Error(response.error)
      } else {
        return response.cid
      }
    }
    async add (buf) {
      let type = buf.constructor.name;
      let cid
      if (type === 'ArrayBuffer') {
        cid = await this.upload(new Blob([buf]))
      } else if (type === "File") {
        cid = await this.upload(buf)
      } else if (type === "Blob") {
        cid = await this.upload(buf)
      } else if (typeof buf === 'string') {
        if (buf.startsWith("http")) {
          cid = await this.import(buf)
        } else {
          cid = await this.upload(new Blob([buf], { type: "text/plain" }))
        }
      }
      return cid;
    }
  }
  class Trade extends Thing {
    async create(body) {
      // 1. build() returns { original, encoded }
      let built = await this.build(body)
      // 2. sign the encoded version
      let signature = await this.sign(built.encoded)
      // 3. attach the signature to the original
      built.original.signature = signature
      // 4. Send the original with signature attached
      let sent = await this.send(built.original)
      return sent
    }
    async build (body) {
      // 1. get encoded trade object
      let built = await this.request("/trade/build", { body })
      // 2. set maker to the original
      built.original.maker = this.account
      built.encoded.message.maker = this.account
      return built
    }
    send (body) {
      return this.request("/trade/send", { body })
    }
  }
  class Rarepress {
    async init (o) {
      if (typeof window.ethereum === 'undefined') {
        alert("Please install MetaMask from https://metamask.io/")
        return;
      }
      let accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      let account = accounts[0];
      this.account = account
      if (!o) o = {host: ""}
      if (!o.host) o.host = ""
      this.host = o.host
      this.token = new Token({ host: o.host, account, })
      this.ipfs = new VIPFS({ host: o.host, account, })
      this.trade = new Trade({ host: o.host, account })
      return account;
    }
    add(x) {
      return this.ipfs.add(x)
    }
    folder(x) {
      return this.ipfs.folder(x)
    }
    build(body) {
      return this.token.build(body)
    }
    sign(token) {
      return this.token.sign(token)
    }
    create(body) {
      return this.token.create(body)
    }
  }
  var root = this
  var rarepress = new Rarepress()
  if(typeof exports !== 'undefined') {
    if(typeof module !== 'undefined' && module.exports) {
      exports = module.exports = rarepress
    }
    exports.rarepress = rarepress
  } else {
    root.rarepress = rarepress
  }
}).call(this)
