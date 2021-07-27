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
*   /ipfs/folder
*
*****************************************/
(() => {
  var root = this
  var Alert
  if (typeof window !== "undefined") {
    Alert = alert
  } else {
    Alert = console.error
  }
  class Thing {
    constructor(o) {
      this.host = o.host
      this.account = o.account
      this.ethereum = o.ethereum
      this.fetch = o.fetch
      this.FormData = o.FormData
    }
    async sign (message) {
      try {
        let res = await this.ethereum.request(
          {
            method: 'eth_signTypedData_v4',
            params: [ this.account, JSON.stringify(message) ],
            from: this.account
          }
        )
        return res;
      } catch (e) {
        Alert(e.message)
      }
    }
    async request(method, path, blob, type) {
      if (method === "GET") {
        let url = (path.startsWith("http") ? path : this.host + path)
        let r = await this.fetch(url).then((res) => {
          return res.json()
        })
        return r;
      } else {
        if (type === "blob") {
          let fd = new this.FormData()
          fd.append('file', blob)
          let r = await this.fetch(this.host + path, {
            method: "POST",
            body: fd
          }).then((res) => {
            return res.json()
          })
          return r
        } else {
          let r = await this.fetch(this.host + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(blob)
          }).then((res) => {
            if (res.ok) {
              return res.json()
            } else {
              return res.text().then((text) => {
                throw new Error(text)
              })
            }
          })
          return r
        }
      }
    }
  }
  class Token extends Thing {
    async init(type) {
      const timestamp = Date.now()  // 13 digits
      const rand = Math.floor(10**11 * Math.random()) // 11 digits
      const base = "" + timestamp + rand // 24 digits
      return BigInt(this.account + base).toString(10)
    }
    async build (body) {
      if (!body.tokenId) {
        body = await this.initialize(body)
      }
      let type = (body.supply && body.supply > 1 ? "ERC1155": "ERC721")
      if (!body.creators) {
        body.creators = [{ account: this.account, value: 10000 }]
      }
      let response = await this.request("POST", "/token/build", { body, type })
      return response
    }
    async send (body, sig) {
      let response = await this.request("POST", "/token/send", { body, sig })
      return response
    }
    async initialize(body) {
      let type = (body.supply && body.supply > 1 ? "ERC1155": "ERC721")
      let tokenId = await this.init(type)
      body.tokenId = tokenId
      if (!body.metadata.name || body.metadata.name.length === 0) body.metadata.name = ""
      if (!body.metadata.description || body.metadata.description.length === 0) body.metadata.description = ""
      if (!body.metadata.image || body.metadata.image.length === 0) body.metadata.image = ""
      return body;
    }
    async create (body) {
      let builtToken = await this.build(body)
      let sig = await this.sign(builtToken)
      let sent = await this.send(builtToken, sig)
      return sent
    }
  }
  /*********************
  * Virtual IPFS
  *********************/
  class VIPFS extends Thing {
    async upload(blob) {
      let response = await this.request("POST", "/ipfs/add", blob, "blob")
      return response.cid
    }
    async import(url) {
      let response = await this.request("POST", "/ipfs/import", { url })
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
      let response = await this.request("POST", "/ipfs/folder", mapping)
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
      } else if (type === "Buffer") {
        cid = await this.upload(buf)
      } else if (typeof buf === 'object' && typeof buf.pipe === 'function' && buf.readable !== false && typeof buf._read === "function" && typeof buf._readableState === "object") {
        // readablestream
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
      let built = await this.request("POST", "/trade/build", { body })
      // 2. set maker to the original
      built.original.maker = this.account
      built.encoded.message.maker = this.account
      return built
    }
    send (body) {
      return this.request("POST", "/trade/send", { body })
    }
  }
  class Rarepress {
    async init (o) {
      if (o.ethereum) {
        this.ethereum = o.ethereum
      } else if (typeof ethereum !== "undefined") {
        this.ethereum = ethereum
      } else {
        Alert("An Ethereum wallet is required. Please install MetaMask from https://metamask.io/")
        return;
      }
      if (o.http && o.http.fetch) {
        this.fetch = o.http.fetch
      } else {
        this.fetch = fetch.bind(window)
      }
      if (o.http && o.http.FormData) {
        this.FormData = o.http.FormData
      } else {
        this.FormData = FormData
      }
      let accounts = await this.ethereum.request({ method: 'eth_requestAccounts' });
      let account = accounts[0];
      this.account = account
      if (!o) o = {host: ""}
      if (!o.host) o.host = ""
      this.host = o.host
      this.token = new Token({
        host: o.host,
        account,
        ethereum: this.ethereum,
        FormData: this.FormData,
        fetch: this.fetch
      })
      this.ipfs = new VIPFS({
        host: o.host,
        account,
        ethereum: this.ethereum,
        FormData: this.FormData,
        fetch: this.fetch
      })
      this.trade = new Trade({
        host: o.host,
        account,
        ethereum: this.ethereum,
        FormData: this.FormData,
        fetch: this.fetch
      })
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
  if(typeof exports !== 'undefined') {
    if(typeof module !== 'undefined' && module.exports) {
      exports = module.exports = Rarepress
    }
  } else {
    root.Rarepress = Rarepress
  }
}).call(this)
