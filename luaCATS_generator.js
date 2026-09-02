import fs from "fs"

function getFlags( args ) {
    const flagsObj = {}

    for( let i = 2; i < args.length; i++ ) {
        const arg = args[i]

        if( arg.startsWith( '--' ) && arg.includes( '=' ) ) {
            const [key, value] = arg.slice( 2 ).split( '=' )
            flagsObj[key] = value
            continue
        }

        if( arg.startsWith( '--' ) ) {
            const key = arg.slice( 2 )

            if( args[i + 1] && !args[i + 1].startsWith( '-' ) ) {
                flagsObj[key] = args[++i]
            } else {
                flagsObj[key] = true
            }

            continue
        }

        if( arg.startsWith( '-' ) ) {
            const key = arg.slice(1)

            if( args[i + 1] && !args[i + 1].startsWith( '-' ) ) {
                flagsObj[key] = args[++i]
            } else {
                flagsObj[key] = true
            }
        }
    }

    return flagsObj
}

const flags = getFlags(process.argv)

let version = "stable"
if( "v" in flags )       version = flags.v
if( "version" in flags ) version = flags.version

let output_path = "./factorio-meta"
if( "o" in flags )      output_path = flags.o
if( "output" in flags ) output_path = flags.output

const url = "https://lua-api.factorio.com/" + version + "/prototype-api.json"
const factorio_api_json = await fetch(url).then(res => res.json())

function write_file( name ) {
    fs.writeFile( output_path + "/" + name + '.lua', file_content, err => {
        if( err ) console.error( err );
        else console.log( "Written to " + output_path + "/" + name + ".lua" )
    } );
}

let file_content = "---@meta\n"
let struct_prototype = false

function parse_array( prop, parent_type ) {
    parse_type( prop.value, parent_type )
    file_content += "[]"
}

function parse_dict( prop, parent_type ) {
    file_content += "table<"
    parse_type( prop.key, parent_type )
    file_content += ", "
    parse_type( prop.value, parent_type )
    file_content += ">"
}

function parse_tuple( prop, parent_type ) {
    file_content += "["

    for( const key in prop.values ) {
        parse_type( prop.values[key], parent_type )
        file_content += ", "
    }

    file_content = file_content.substring( 0, file_content.length-2 )
    file_content += "]"
}

function parse_union( prop, parent_type ) {
    for( const key in prop.options ) {
        parse_type( prop.options[key], parent_type )
        file_content += "|"
    }
    file_content = file_content.substring( 0, file_content.length-1 )
}

function parse_literal( prop, parent_type ) {
    file_content += "\""
    parse_type( prop.value, parent_type )
    file_content += "\""
}

function parse_properties_sorted( properties ) {
    const sorted_properties = [...properties].sort( (a, b) => a.order - b.order );
    for( const property_key in sorted_properties ) {
        const property = sorted_properties[property_key]

        parse_property( property )
    }
}

function parse_struct( proptype ) {
    if( !proptype.properties ) {
        console.log( "Did not provide properties for struct prototype" )
        return
    }

    file_content += "\n\n"
    proptype.name = "_" + proptype.name

    file_content += "---@class " + proptype.name
    parse_description( proptype.description )
    file_content += "\n"

    parse_properties_sorted( proptype.properties )

    file_content = file_content.substring( 0, file_content.length-1 )

    proptype.properties = []
    proptype.description = ""
    proptype.name = proptype.name.substring( 1, proptype.name.length )
}

function parse_type( proptype, parent_type ) {
    if( typeof( proptype ) == "string" || typeof( proptype ) == "number" || typeof( proptype ) == "boolean" ) {
        file_content += proptype
    } else {
        switch( proptype.complex_type ) {
            case "array":
                parse_array( proptype, parent_type )
                break
            case "dictionary":
                parse_dict( proptype, parent_type )
                break
            case "tuple":
                parse_tuple( proptype, parent_type )
                break
            case "union":
                parse_union( proptype, parent_type )
                break
            case "literal":
                parse_literal( proptype, parent_type )
                break
            case "struct":
                if( !struct_prototype || struct_prototype.name == parent_type.name ) {
                    struct_prototype = parent_type
                    file_content += "_" + parent_type.name
                } else {
                    console.log( "Overwriting of struct_prototype not allowed" )
                    console.log( struct_prototype )
                    console.log( parent_type )
                }
                break
            case "type":
                parse_type( proptype.value, proptype )

                // TODO
                // parse_description( proptype.description )
                break
            default:
                console.log( "Did not implement complex type: " + proptype.complex_type )
        }
    }
}

function parse_description( desc ) {
    if( desc.length > 0 ) {
        if( desc.includes("\n") ) {
            file_content += " " + desc.replace(/[\n]+/g, " ")
        } else {
            file_content += " " + desc
        }
    }
}

function parse_property( property, parent_type ) {
    file_content += "---@field " + property.name

    file_content += " "
    parse_type( property.type, parent_type )
    if( property.optional ) file_content += "?"

    parse_description( property.description )

    file_content += "\n"
}

// Properties
for( const key in factorio_api_json.prototypes ) {
    const prot = factorio_api_json.prototypes[key]

    if( prot.deprecated ) {
        file_content += "\n---@deprecated " + prot.description
    }

    file_content += "\n---@class " + prot.name

    if( "parent" in prot ) file_content += ": " + prot.parent

    parse_description( prot.description )
    file_content += "\n"

    parse_properties_sorted( prot.properties )
}

write_file( "prototypes" )

// Types
file_content = "---@meta\n"

const builtin_map = { "bool": "boolean", "int64": "number", "DataExtendMethod": "function", "boolean": null, "double": "number", "float": "number", "int16": "number", "int32": "number", "int8": "number", "number": null, "string": null, "table": null, "uint16": "number", "uint32": "number", "uint32": "number", "uint64": "number", "uint8": "number" }

function parse_type_types( type ) {
    if( typeof( type.type ) == "string" ) {
        if( type.type == "builtin" ) {
            if( !(type.name in builtin_map) ) console.log( "Builtin " + type.name + " not available" )
            else if( builtin_map[type.name] ) {
                file_content += "\n---@alias " + type.name + " " + builtin_map[type.name]
            }
        } else {
            file_content += "\n---@alias " + type.name + " string"
        }
    } else {
        switch( type.type.complex_type ) {
            case "array":
            case "dictionary":
            case "tuple":
            case "union":
            case "literal":
                file_content += "\n---@alias " + type.name + " "
                parse_type( type.type, type )
                break

            case "struct":
                file_content += "\n---@class " + type.name
                break
            default:
                console.log( "Complex type " + type.type.complex_type + " for types not implemented" )
        }
    }
}

for( const key in factorio_api_json.types ) {
    const type = factorio_api_json.types[key]

    parse_type_types( type )

    if( struct_prototype ) {
        parse_struct( struct_prototype )
        struct_prototype = false
    }

    parse_description( type.description )
    file_content += "\n"

    if( !type.properties ) continue

    parse_properties_sorted( type.properties )
}

// Builtins
file_content += "---@alias double number Format uses a dot as its decimal delimiter. Doubles are stored in the [double precision](https://en.wikipedia.org/wiki/Double-precision_floating-point_format) floating point format. May not be [NaN](https://en.wikipedia.org/wiki/NaN)."
file_content += "---@alias float number Format uses a dot as its decimal delimiter. Floats are stored in the [single precision](https://en.wikipedia.org/wiki/Single-precision_floating-point_format) floating point format. May not be [NaN](https://en.wikipedia.org/wiki/NaN)."
file_content += "---@alias int16 number 16 bit signed integer. Ranges from `-32 768` to `32 767`, or `[-2^15, 2^15-1]`. Decimal numbers are automatically truncated when used in place of `int16`."
file_content += 

write_file( "types" )

// Defines
file_content = "---@meta\n\n---@class defines"

for( const key in factorio_api_json.defines ) {
    const def = factorio_api_json.defines[key]

    file_content += "\n---@field " + def.name + " defines." + def.name
}

var subkeys_array = []

function parse_define( def ) {
    if( def.values ) {
        const sorted_values = [...def.values].sort( (a, b) => a.order - b.order );
        for( const value_key in sorted_values ) {
            const value = sorted_values[value_key]

            file_content += "\n---@field " + value.name + " any"
        }
    }

    if( def.subkeys ) {
        const sorted_subkeys = [...def.subkeys].sort( (a, b) => a.order - b.order );
        for( const subkeys_key in sorted_subkeys ) {
            const subkey = sorted_subkeys[subkeys_key]

            file_content += "\n---@field " + subkey.name + " defines." + def.name + "." + subkey.name

            subkey.name = def.name + "." + subkey.name
            subkeys_array.push( subkey )
        }
    }
}

for( const key in factorio_api_json.defines ) {
    const def = factorio_api_json.defines[key]

    file_content += "\n\n---@class defines." + def.name
    parse_define( def )

    while( subkeys_array.length > 0 ) {
        const subkey = subkeys_array.shift()

        file_content += "\n\n---@class defines." + subkey.name

        parse_define( subkey )
    }
}

write_file( "defines" )

// Globals
file_content =
`---@diagnostic disable: missing-fields
---@diagnostic disable: missing-return
---@diagnostic disable: unused-local

---@type defines
_G.defines = {}

---@type Data
_G.data = {}

---@type Mods
_G.mods = {}

---@type Settings
_G.settings = {}

---@type FeatureFlags
_G.feature_flags = {}

_G.helpers = {}

---@param data table
---@return string
function helpers.table_to_json( data ) end

---@param json string
---@return table
function helpers.json_to_table( json ) end

---@param filename string
---@param data LocalisedString
---@param append boolean?
---@param for_player uint32?
function helpers.write_file( filename, data, append, for_player ) end

---@diagnostic enable: missing-fields
---@diagnostic enable: missing-return
---@diagnostic enable: unused-local
`

write_file( "globals" )
