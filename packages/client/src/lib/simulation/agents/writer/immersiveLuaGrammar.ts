import type { LocalImmersiveScenario } from "@/lib/scenario";
import type { StateDto } from "@/lib/simulation/state";

/**
 * Build a dynamic Lua GNBF grammar for LLM, immersive mode.
 * The Lua script contains `start` and `on_eos` functions,
 * which return GNBF grammar for LLM to follow.
 */
export function buildImmersiveLuaGnbfGrammar(
  system: string,
  scenario: LocalImmersiveScenario,
  currentState: StateDto,
  enabledCharacterIds: string[],
  allowedSceneIds: string[],
  locale: Intl.Locale,
  requireSystemToken: boolean,
) {
  let characterTextRule: string;

  switch (locale.language) {
    case "ru":
      characterTextRule = `[A-Za-zЁёА-я*] [a-zA-ZЁёА-я0-9: .,!?*"\\'-]+`;
      break;
    default:
      characterTextRule = `[A-Za-z*] [a-zA-Z0-9: .,!?*"\\'-]+`;
  }

  return `
-- Map function for Lua tables.
function map(tbl, f)
  local t = {}

  for k, v in pairs(tbl) do
    t[k] = f(v)
  end

  return t
end

-- Merge two tables.
function merge(t1, t2)
  for k, v in pairs(t2) do
    t1[k] = v
  end

  return t1
end

-- Find index of an element in a table.
function find(t, e)
  for i, v in ipairs(t) do
    if v == e then
      return i
    end
  end

  return nil
end

-- Concatenate a non-array table.
function pconcat(t)
  local ct = {}
  local n = 1

  for _, v in pairs(t) do
    ct[n] = v
    n = n + 1
  end

  return table.concat(ct)
end

function dump(o)
  if type(o) == 'table' then
    local s = '{ '

    for k,v in pairs(o) do
        if type(k) ~= 'number' then k = '"'..k..'"' end
        s = s .. '['..k..'] = ' .. dump(v) .. ','
    end

    return s .. '} '
  else
    return tostring(o)
  end
end

-- Join grammar rules into a single GNBF string.
function rules_to_grammar(rules)
  local grammar = ""

  for id, rule in pairs(rules) do
    grammar = grammar .. id .. " ::= " .. rule .. "\\n"
  end

  return grammar
end

local enabled_character_ids = {${enabledCharacterIds
    .map((id) => `"${id}"`)
    .join(", ")}}

-- Build character line rules.
function character_line_rules()
  local rules = {}

  -- ADHOC: If enabled_character_ids is empty, replace it with {'narrator'}.
  if (#enabled_character_ids == 0) then
    enabled_character_ids = {'narrator'}
  end

  -- characterId ::= "alice" | "bob" | ...
  rules["characterId"] = table.concat(
    map(
      enabled_character_ids,
      function(id) return '"' .. id .. '"' end
    ),
    " | ")

  rules["clock"] = '[0-9]{2} ":" [0-9]{2}'
  rules["characterTextRule"] = '${characterTextRule}'
  rules["characterLine"] = '"<" characterId "> (" clock ") " characterTextRule "\\n"'

  print "Debug: character line rules"

  return rules
end

-- Current simulation state, as a Lua table.
local simulation_state = {
  ["stage"] = {
    ["scene_id"] = "${currentState.stage.sceneId}",
    ["characters"] = {
      ${currentState.stage.characters
        .map(
          (character) =>
            `["${character.id}"] = {
        ["expression_id"] = "${character.expressionId}",
        ["outfit_id"] = "${character.outfitId}",
      }`,
        )
        .join(",\n")}
    },
  },
};

-- Initial function, which defines the initial grammar for LLM to follow.
-- The function returns the initial grammar, in GNBF format.
-- We give LLM a choice to respond either with a
-- "<${system}> [" token, or with a full character line.
function start()
  -- Let's define a table with rules.
  local rules = {}

  -- Define the system token rule.
  rules["systemToken"] = '"<${system}> ["'

  -- Shall merge the rules table with the character line rules.
  rules = merge(rules, character_line_rules())

  -- Define the root rule.
  rules["root"] = "${requireSystemToken ? "systemToken" : "systemToken | characterLine"}"

  print "Debug: start()"

  -- Let's return the resulting grammar.
  return rules_to_grammar(rules)
end

-- We need some global variable to store the current step.
local step = "initial"

-- And some more to store the already updated state.
local has_scene_changed = false
local added_characters = {}
local removed_characters = {}
local updated_expression_characters = {}
local updated_outfit_characters = {}
local main_character_id = "${scenario.defaultCharacterId}"

-- Let's get to the function which is called each time LLM generated an EOS token.
function on_eos(generated_text)
  print("on_eos: " .. generated_text)

  if (step == "initial") then
    -- Let's check if the generated text is a system token.
    if (generated_text == "<${system}> [") then
      -- If it is, let's move to the next step, and respond with a JSON grammar.
      step = "system"
      return system_command_grammar()
    else
      -- Otherwise, we've generated a character line.
      -- There is nothing left to do, so let's return nil.
      return nil
    end
  elseif (step == "system") then
    -- We're expecting a system command.
    -- Let's parse the generated text.

    -- The text may end with "]\\n".
    local system_line_complete = false
    if (generated_text:sub(-2) == "]\\n") then
      print "System line ends with ]"
      system_line_complete = true
      generated_text = generated_text:sub(1, -3)
    end

    -- Legal case: it returns "]\\n" only, which means no command at all.
    if (not (generated_text == "")) then
      print "Non-empty generated text"

      -- Remove trailing comma, if any.
      if (generated_text:sub(-1) == ",") then
        print "Removing trailing comma"
        generated_text = generated_text:sub(1, -2)
      end

      local command = cjson.decode(generated_text)
      print("Command: " .. dump(command))

      if (command.name == "setScene") then
        print("Setting scene ID: " .. command.args.sceneId)
        simulation_state.stage.scene_id = command.args.sceneId
        has_scene_changed = true
      elseif (command.name == "addCharacter") then
        print("Adding character: " .. command.args.characterId)

        simulation_state.stage.characters[command.args.characterId] = {
          expression_id = command.args.expressionId,
          outfit_id = command.args.outfitId,
        }

        added_characters[command.args.characterId] = true

        -- Add the character to the list of characters allowed to speak.
        table.insert(enabled_character_ids, command.args.characterId)
      elseif (command.name == "removeCharacter") then
        print("Removing character: " .. command.args.characterId)
        simulation_state.stage.characters[command.args.characterId] = nil
        removed_characters[command.args.characterId] = true

        -- Remove the character from the list of characters allowed to speak.
        local index = find(enabled_character_ids, command.args.characterId)
        table.remove(enabled_character_ids, index)
      elseif (command.name == "setExpression") then
        print("Setting expression ID: " .. command.args.expressionId)
        simulation_state.stage.characters[command.args.characterId].expression_id = command.args.expressionId
        updated_expression_characters[command.args.characterId] = true
      elseif (command.name == "setOutfit") then
        print("Setting outfit ID: " .. command.args.outfitId)
        simulation_state.stage.characters[command.args.characterId].outfit_id = command.args.outfitId
        updated_outfit_characters[command.args.characterId] = true
      else
        -- Illegal command (throw an error).
        error("Illegal command: " .. generated_text)
      end
    else
      print "Empty generated text"
    end

    if (system_line_complete) then
      print "System line complete"

      -- If the system line is complete, let's move back to the initial step.
      step = "initial"

      -- And return the character line -only grammar.
      local rules = { ["root"] = "characterLine" }
      rules = merge(rules, character_line_rules())

      return rules_to_grammar(rules)
    else
      print "System line not complete"

      -- Otherwise, we're expecting yet another system command.
      return system_command_grammar()
    end
  end
end

-- This function returns grammar for JSON commands,
-- in accordance with the current simulation state.
function system_command_grammar()
  local rules = {}
  local commands = {}

  if (not has_scene_changed) then
    -- Add the setScene rule.
    rules["sceneId"] = '${allowedSceneIds.map((id) => `"${id}"`).join(" | ")}'
    rules["setScene"] = '"{\\\\"name\\\\":\\\\"setScene\\\\",\\\\"args\\\\":{\\\\"sceneId\\\\":\\\\"" sceneId "\\\\"}}"'

    table.insert(commands, "setScene")
  end

  local scenario_character_ids = {${Object.keys(scenario.content.characters)
    .map((id) => `"${id}"`)
    .join(", ")}}

  -- Let's define "<char>-expression" and "<char>-outfit" rules.
  -- If the character is on the stage, they have an expression
  -- and outfit already set; we'll filter these out.
  --

  local allowed_expressions_ids = {
    ${Object.entries(scenario.content.characters)
      .map(
        ([characterId, character]) =>
          `["${characterId}"] = {${character.expressions
            .map((e) => `"${e}"`)
            .join(", ")}}`,
      )
      .join(",\n")}
  }

  local allowed_outfits_ids = {
    ${Object.entries(scenario.content.characters)
      .map(
        ([characterId, character]) =>
          `["${characterId}"] = {${Object.keys(character.outfits)
            .map((o) => `"${o}"`)
            .join(", ")}}`,
      )
      .join(",\n")}
  }

  for _, character_id in ipairs(scenario_character_ids) do
    local expression_ids = allowed_expressions_ids[character_id]
    local outfit_ids = allowed_outfits_ids[character_id]

    if (simulation_state.stage.characters[character_id]) then
      -- Remove the current expression ID from the list.
      local current_expression_id = simulation_state.stage.characters[character_id].expression_id
      local index = find(expression_ids, current_expression_id)
      table.remove(expression_ids, index)

      -- Remove the current outfit ID from the list.
      local current_outfit_id = simulation_state.stage.characters[character_id].outfit_id
      local index = find(outfit_ids, current_outfit_id)
      table.remove(outfit_ids, index)
    end

    if (#expression_ids > 0) then
      -- Wrap the expression IDs in quotes.
      expression_ids = map(expression_ids, function(e) return '"' .. e .. '"' end)

      -- alice-expression ::= "smiling" | "neutral" | "angry"
      rules[character_id .. "-expression"] = table.concat(expression_ids, " | ")
    end

    if (#outfit_ids > 0) then
      -- Wrap the outfit IDs in quotes.
      outfit_ids = map(outfit_ids, function(o) return '"' .. o .. '"' end)

      -- alice-outfit ::= "casual" | "eveningSuit" | "outdoor"
      rules[character_id .. "-outfit"] = table.concat(outfit_ids, " | ")
    end
  end

  local add_character_rules = {}
  local remove_character_rules = {}
  local set_expression_rules = {}
  local set_outfit_rules = {}

  for _, character_id in ipairs(scenario_character_ids) do
    -- For each character currently absent on stage,
    -- and in enabled_character_ids,
    -- we'll define a "<char>-addCharacter" rule,
    -- given that they're not in the added_characters table,
    -- and not in the removed_characters table.
    if (
      not simulation_state.stage.characters[character_id] and
      enabled_character_ids[character_id] and
      not added_characters[character_id] and
      not removed_characters[character_id]
    ) then
      -- alice-addCharacter ::= "{\"name\":\"addCharacter\",\"args\":{\"character_id\":\"alice\",\"outfitId\":\"" alice-outfit ", \"expressionId\":\"" alice-expression "\"}}"'
      rules[character_id .. "-addCharacter"] = '"{\\\\"name\\\\":\\\\"addCharacter\\\\",\\\\"args\\\\":{\\\\"characterId\\\\":\\\\"' .. character_id .. '\\\\",\\\\"outfitId\\\\":\\\\"" ' .. character_id .. '-outfit' .. ' "\\\\", \\\\"expressionId\\\\":\\\\"" ' .. character_id .. '-expression' .. ' "\\\\"}}"'

      table.insert(add_character_rules, character_id)
    end

    -- For each character currently on stage, we'll define
    -- "<char>-removeCharacter", "<char>-setExpression"
    -- and "<char>-setOutfit" rules,
    -- given that they're not already in the according tables.
    -- Can not update the main character.
    if (
      not (main_character_id == character_id) and
      simulation_state.stage.characters[character_id]
    ) then
      if (
        not removed_characters[character_id] and
        not added_characters[character_id]
      ) then
        -- alice-removeCharacter ::= "{\"name\":\"removeCharacter\",\"args\":{\"characterId\":\"alice\"}}"
        rules[character_id .. "-removeCharacter"] = '"{\\\\"name\\\\":\\\\"removeCharacter\\\\",\\\\"args\\\\":{\\\\"characterId\\\\":\\\\"' .. character_id .. '\\\\"}}"'

        table.insert(remove_character_rules, character_id)
      end

      if (
        not updated_expression_characters[character_id] and
        not removed_characters[character_id] and
        #allowed_expressions_ids[character_id] > 0
      ) then
        -- alice-setExpression ::= "{\"name\":\"setExpression\",\"args\":{\"characterId\":\"alice\",\"expressionId\":\"" alice-expression "\"}}"
        rules[character_id .. "-setExpression"] = '"{\\\\"name\\\\":\\\\"setExpression\\\\",\\\\"args\\\\":{\\\\"characterId\\\\":\\\\"' .. character_id .. '\\\\",\\\\"expressionId\\\\":\\\\"" ' .. character_id .. '-expression' .. ' "\\\\"}}"'

        table.insert(set_expression_rules, character_id)
      end

      if (
        not updated_outfit_characters[character_id] and
        not removed_characters[character_id] and
        #allowed_outfits_ids[character_id] > 0
      ) then
        -- alice-setOutfit ::= "{\"name\":\"setOutfit\",\"args\":{\"characterId\":\"alice\",\"outfitId\":\"" alice-outfit "\"}}"
        rules[character_id .. "-setOutfit"] = '"{\\\\"name\\\\":\\\\"setOutfit\\\\",\\\\"args\\\\":{\\\\"characterId\\\\":\\\\"' .. character_id .. '\\\\",\\\\"outfitId\\\\":\\\\"" ' .. character_id .. '-outfit' .. ' "\\\\"}}"'

        table.insert(set_outfit_rules, character_id)
      end
    end
  end

  -- Let's set the add_character_rules.
  if (next(add_character_rules)) then
    -- addCharacter ::= alice-addCharacter | bob-addCharacter | ...
    rules["addCharacter"] = table.concat(map(add_character_rules, function(character_id) return character_id .. "-addCharacter" end), " | ")

    table.insert(commands, "addCharacter")
  end

  -- Let's set the remove_character_rules.
  if (next(remove_character_rules)) then
    -- removeCharacter ::= alice-removeCharacter | bob-removeCharacter | ...
    rules["removeCharacter"] = table.concat(map(remove_character_rules, function(character_id) return character_id .. "-removeCharacter" end), " | ")

    table.insert(commands, "removeCharacter")
  end

  -- Let's set the set_expression_rules.
  if (next(set_expression_rules)) then
    -- setExpression ::= alice-setExpression | bob-setExpression | ...
    rules["setExpression"] = table.concat(map(set_expression_rules, function(character_id) return character_id .. "-setExpression" end), " | ")

    table.insert(commands, "setExpression")
  end

  -- Let's set the set_outfit_rules.
  if (next(set_outfit_rules)) then
    -- setOutfit ::= alice-setOutfit | bob-setOutfit | ...
    rules["setOutfit"] = table.concat(map(set_outfit_rules, function(character_id) return character_id .. "-setOutfit" end), " | ")

    table.insert(commands, "setOutfit")
  end

  -- Finally, let's define the root rule.
  -- root ::= ((setScene | addCharacter | ...) ("," | "]\\n")) | ("]\\n")
  rules["root"] = '((' .. table.concat(commands, " | ") .. ') ("," | "]\\\\n")) | ("]\\\\n")'

  -- And return the resulting grammar.
  return rules_to_grammar(rules)
end`;
}
