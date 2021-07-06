const {ApolloServer,gql,UserInputError,AuthenticationError} = require('apollo-server')
const mongoose = require('mongoose')
const jwt=require('jsonwebtoken')
const Author = require('./models/Author')
const Book = require('./models/Book')
const User = require('./models/User')
const {PubSub} = require('apollo-server')
const pubsub = new PubSub()

const MONGODB_URI = 'mongodb+srv://pradeepgraphql:curious25@cluster0.tywlr.mongodb.net/handsOnGraphQL?retryWrites=true&w=majority'

const JWT_SECRET = 'secret'

mongoose.connect(MONGODB_URI,{useNewUrlParser:true,useUnifiedTopology:true,useFindAndModify:false,useCreateIndex:true})
.then(() => {
  console.log('connnected to mongodb')
})
.catch((error)=>{
    console.log('error while connecting mongodb',error.message)
  })
  
  const typeDefs = gql`

  type Author {
    name: String!
    born: Int
    bookCount: Int!
    id: ID!
  }

  type Book {
    title: String!
    published: Int!
    author: Author!
    id: ID!
    genres: [String!]!
  }

  type User {
    username: String!
    favoriteGenre: String!
    id: ID!
  }

  type Token{
    value: String!
  }

  type Query {
    bookCount: Int!
    authorCount: Int!
    allBooks(author:String,genre:String): [Book!]!
    allAuthors: [Author!]!
    me:User
    allUsers: [User!]!
  }

  type Mutation {
    addBook(
      title: String!
      author: String!
      published: Int!
      genres: [String!]!
      ) : Book

      editAuthor(
        name: String!
        setBornTo:Int!
        ) : Author

      createUser(
        username: String! 
        favoriteGenre: String! 
        ): User

      login(
        username:String! 
        password:String!
      ): Token
  }

  type Subscription {
    bookAdded: Book!
  }
`
    const resolvers = {
      Query: {
          bookCount: () => Book.collection.countDocuments(),
          authorCount: () => Author.collection.countDocuments(),
          allBooks:async (root,args) => {
            console.log(args)
          if(args.author && args.genre) 
          {
            const books =await Book.find({}).populate('author')
            return books.filter(book => book.author.name === args.author && book.genres.includes(args.genre)) 
          }
          else if(args.author)
          {
            const books =await Book.find({}).populate('author')
            return books.filter(book => (book.author.name === args.author)) 
          }
          else if(args.genre) 
          {
            const books =await Book.find({}).populate('author')
            return books.filter(book => book.genres.includes(args.genre)) 
          }
        const books = await Book.find({}).populate('author')
        return books
  },
  allAuthors: (root,args) => Author.find({}),
  me: (root,args,context) => {
    return context.currentUser
  },
  allUsers: (root,args) => User.find({})
},
Mutation: {
  addBook:async (root,args,context) => {
    const isPresent = await Author.findOne({name:args.author})
    const currentUser = context.currentUser

    if(!currentUser){
      throw new AuthenticationError("not authenticated")
    }

    if(!isPresent)
    {
      try{
        const newAuthor = new Author({name:args.author,born:null})
        await newAuthor.save()        
      }catch(error){
        throw new UserInputError(error.message,{
          invalidArgs:args
        })
      }
    }
    const findAuthor = await Author.findOne({name:args.author})
    const newBook = new Book({
      title:args.title,
      author:findAuthor,
      published:args.published,
      genres:args.genres,
    })
    try{
      await newBook.save()
    }catch(error){
      throw new UserInputError(error.message,{
          invalidArgs:args
        })
      }

      pubsub.publish('BOOK_ADDED',{bookAdded:newBook})

      return newBook
    },
    editAuthor:async (root,args,context) => {
    const currentUser = context.currentUser
    if(!currentUser){
      throw new AuthenticationError("not authenticated")
    }
    const author =await Author.findOne({name:args.name})
    if(!author) return null
    author.born=args.setBornTo
    try{
    await author.save()
    }catch(error){
      throw new UserInputError(error.message,{
        invalidArgs: args,
      })
    }
    return author
  },
  createUser:(root,args) => {
    const user = new User({
      username:args.username,
      favoriteGenre:args.favoriteGenre,
    })
    return user.save()
    .catch(error => {
      throw new UserInputError(error.message, {
        invalidArgs: args,
      })
    })
  },
  login: async (root,args) => {
    const user =await User.findOne({username:args.username})

    if(!user || args.password !=='secret')
    {
      throw new UserInputError("wrong credentials")
    }
    const userForToken = {
      username:user.username,
      id:user._id
    }

    return {value: jwt.sign(userForToken,JWT_SECRET)}
  }
},
Author: {
  bookCount:async (root) => {
    const books = await Book.find({}).populate('author')
    return books.filter(book => book.author.name === root.name).length
  }
},
Subscription: {
  bookAdded: {
    subscribe: () => pubsub.asyncIterator(['BOOK_ADDED'])
  },
},
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({req}) => {
    const auth = req ? req.headers.authorization : null 
    if(auth && auth.toLowerCase().startsWith('bearer ')) {
      const decodedToken = jwt.verify(
        auth.substring(7),JWT_SECRET
        )
      const currentUser = await User.findById(decodedToken.id)
      return {currentUser}
    }
  }
}) //heart of the code ;)

server.listen().then(({url,subscriptionsUrl}) => {
  console.log(`Server ready at ${url}`)
  console.log(`Subsciption ready at ${subscriptionsUrl}`)
})
const del =async ()=>{
    
    await Book.deleteMany({})
    await Author.deleteMany({})
  }
  // del()