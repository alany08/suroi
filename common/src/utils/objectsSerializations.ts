import {
    ANIMATION_TYPE_BITS,
    ObjectCategory,
    PLAYER_ACTIONS_BITS,
    PlayerActions,
    type AnimationType
} from "../constants";
import { HealingItems, type HealingItemDefinition } from "../definitions/healingItems";
import { Loots, type LootDefinition } from "../definitions/loots";
import { type ObstacleDefinition } from "../definitions/obstacles";
import { Skins, type SkinDefinition } from "../definitions/skins";
import { type Orientation, type Variation } from "../typings";
import { ObstacleSpecialRoles } from "./objectDefinitions";
import { type ObjectType } from "./objectType";
import { type SuroiBitStream } from "./suroiBitStream";
import { type Vector } from "./vector";

export interface ObjectsNetData {
    //
    // Player Data
    //
    [ObjectCategory.Player]: {
        position: Vector
        rotation: number
        animation: {
            type: AnimationType
            seq: boolean
        }
    } & ({ fullUpdate: false } | {
        fullUpdate: true
        invulnerable: boolean
        activeItem: LootDefinition
        skin: SkinDefinition
        helmet: number
        vest: number
        backpack: number
        action: ({
            seq: number
        }) & ({
            type: Exclude<PlayerActions, PlayerActions.UseItem>
            item?: undefined
        } | {
            type: PlayerActions.UseItem
            item: HealingItemDefinition
        })
    })
    //
    // Obstacle Data
    //
    [ObjectCategory.Obstacle]: {
        scale: number
        dead: boolean
        definition: ObstacleDefinition
        door?: {
            offset: number
        }
    } & ({ fullUpdate: false } | {
        fullUpdate: true
        position: Vector
        rotation: {
            orientation: Orientation
            rotation: number
        }
        variation?: Variation
    })
    //
    // Loot Data
    //
    [ObjectCategory.Loot]: {
        position: Vector
    } & ({ fullUpdate: false } | {
        fullUpdate: true
        count: number
        isNew: boolean
    })
    //
    // DeathMarker Data
    //
    [ObjectCategory.DeathMarker]: {
        position: Vector
        player: {
            name: string
            isDev: boolean
            nameColor: string
        }
        isNew: boolean
    }
    //
    // Building Data
    //
    [ObjectCategory.Building]: {
        dead: boolean
    } & ({ fullUpdate: false } | {
        fullUpdate: true
        position: Vector
        rotation: Orientation
    })
    //
    // Decal Data
    //
    [ObjectCategory.Decal]: {
        position: Vector
        rotation: number
    }
    //
    // Explosion Data
    //
    [ObjectCategory.Explosion]: {
        position: Vector
    }
    //
    // Emoji Data
    //
    [ObjectCategory.Emote]: {
        playerID: number
    }
}

interface ObjectSerialization<T extends ObjectCategory> {
    serializePartial: (stream: SuroiBitStream, data: ObjectsNetData[T]) => void
    serializeFull: (stream: SuroiBitStream, data: ObjectsNetData[T]) => void
    deserializePartial: (stream: SuroiBitStream, type: ObjectType<T>) => ObjectsNetData[T]
    deserializeFull: (stream: SuroiBitStream, type: ObjectType<T>) => ObjectsNetData[T]
}

export const ObjectSerializations: { [K in ObjectCategory]: ObjectSerialization<K> } = {
    //
    // Player serialization
    //
    [ObjectCategory.Player]: {
        serializePartial(stream, data): void {
            stream.writePosition(data.position);
            stream.writeRotation(data.rotation, 16);
            stream.writeBits(data.animation.type, ANIMATION_TYPE_BITS);
            stream.writeBoolean(data.animation.seq);
        },
        serializeFull(stream, data): void {
            this.serializePartial(stream, data);
            if (!data.fullUpdate) return;
            stream.writeBoolean(data.invulnerable);
            stream.writeUint8(Loots.idStringToNumber[data.activeItem.idString]);
            stream.writeUint8(Skins.findIndex(s => s === data.skin));
            stream.writeBits(data.helmet, 2);
            stream.writeBits(data.vest, 2);
            stream.writeBits(data.backpack, 2);

            stream.writeBits(data.action.type, PLAYER_ACTIONS_BITS);
            stream.writeBits(data.action.seq, 2);
            if (data.action.item) {
                stream.writeUint8(HealingItems.findIndex(h => h === data.action.item));
            }
        },
        deserializePartial(stream) {
            return {
                position: stream.readPosition(),
                rotation: stream.readRotation(16),
                fullUpdate: false,
                animation: {
                    type: stream.readBits(ANIMATION_TYPE_BITS),
                    seq: stream.readBoolean()
                }
            };
        },
        deserializeFull(stream, type) {
            const partial = this.deserializePartial(stream, type);
            const full: Partial<ObjectsNetData[ObjectCategory.Player]> = {
                fullUpdate: true,
                invulnerable: stream.readBoolean(),
                activeItem: Loots.definitions[stream.readUint8()],
                skin: Skins[stream.readUint8()],
                helmet: stream.readBits(2),
                vest: stream.readBits(2),
                backpack: stream.readBits(2),
                action: {
                    type: stream.readBits(PLAYER_ACTIONS_BITS),
                    seq: stream.readBits(2)
                }
            };

            if (full.action && full.action.type === PlayerActions.UseItem) {
                full.action.item = HealingItems[stream.readUint8()];
            }

            return { ...partial, ...full as ObjectsNetData[ObjectCategory.Player] };
        }
    },
    //
    // Obstacle Serialization
    //
    [ObjectCategory.Obstacle]: {
        serializePartial(stream, data): void {
            stream.writeScale(data.scale);
            stream.writeBoolean(data.dead);
            if (data.definition.role === ObstacleSpecialRoles.Door && data.door) {
                stream.writeBits(data.door.offset, 2);
            }
        },
        serializeFull(stream, data): void {
            this.serializePartial(stream, data);
            if (!data.fullUpdate) return;
            stream.writePosition(data.position);
            stream.writeObstacleRotation(data.rotation.rotation, data.definition.rotationMode);
            if (data.definition.variations !== undefined && data.variation !== undefined) {
                stream.writeVariation(data.variation);
            }
        },
        deserializePartial(stream, type) {
            const definition = type.definition as ObstacleDefinition;
            const data: ObjectsNetData[ObjectCategory.Obstacle] = {
                definition,
                fullUpdate: false,
                scale: stream.readScale(),
                dead: stream.readBoolean()
            };

            if (definition.role === ObstacleSpecialRoles.Door) {
                data.door = {
                    offset: stream.readBits(2)
                };
            }

            return data;
        },
        deserializeFull(stream, type) {
            const definition = type.definition as ObstacleDefinition;
            const partial = this.deserializePartial(stream, type);
            const full: Partial<ObjectsNetData[ObjectCategory.Obstacle]> = {
                fullUpdate: true,
                position: stream.readPosition(),
                rotation: stream.readObstacleRotation(definition.rotationMode)
            };

            if (definition.variations !== undefined) {
                full.variation = stream.readVariation();
            }

            return { ...partial, ...full as ObjectsNetData[ObjectCategory.Obstacle] };
        }
    },
    //
    // Loot Serialization
    //
    [ObjectCategory.Loot]: {
        serializePartial(stream, data): void {
            stream.writePosition(data.position);
        },
        serializeFull(stream, data): void {
            this.serializePartial(stream, data);
            if (!data.fullUpdate) return;
            stream.writeBits(data.count, 9);
            stream.writeBoolean(data.isNew);
        },
        deserializePartial(stream) {
            return {
                position: stream.readPosition(),
                fullUpdate: false
            };
        },
        deserializeFull(stream, type) {
            return {
                ...this.deserializePartial(stream, type),
                fullUpdate: true,
                count: stream.readBits(9),
                isNew: stream.readBoolean()
            };
        }
    },
    //
    // Death Marker Serialization
    //
    [ObjectCategory.DeathMarker]: {
        serializePartial(stream, data): void {
            stream.writePosition(data.position);
            stream.writeBoolean(data.isNew);
            stream.writePlayerName(data.player.name);
            const hasColor = data.player.isDev && data.player.nameColor.length > 0;
            stream.writeBoolean(hasColor);
            if (hasColor) stream.writeUTF8String(data.player.nameColor, 10);
        },
        serializeFull(stream, data): void {
            this.serializePartial(stream, data);
        },
        deserializePartial(stream) {
            const position = stream.readPosition();
            const isNew = stream.readBoolean();
            const name = stream.readPlayerName();
            const isDev = stream.readBoolean();
            const nameColor = isDev ? stream.readUTF8String(10) : "";

            return {
                position,
                isNew,
                player: {
                    name,
                    isDev,
                    nameColor
                }
            };
        },
        deserializeFull(stream, type) {
            return this.deserializePartial(stream, type);
        }
    },
    //
    // Building Serialization
    //
    [ObjectCategory.Building]: {
        serializePartial(stream, data): void {
            stream.writeBoolean(data.dead);
        },
        serializeFull(stream, data): void {
            this.serializePartial(stream, data);
            if (!data.fullUpdate) return;
            stream.writePosition(data.position);
            stream.writeBits(data.rotation, 2);
        },
        deserializePartial(stream) {
            return {
                dead: stream.readBoolean(),
                fullUpdate: false
            };
        },
        deserializeFull(stream, type) {
            return {
                ...this.deserializePartial(stream, type),
                fullUpdate: true,
                position: stream.readPosition(),
                rotation: stream.readBits(2) as Orientation
            };
        }
    },
    //
    // Decal Serialization
    //
    [ObjectCategory.Decal]: {
        serializePartial(stream, data): void {
            stream.writePosition(data.position);
            stream.writeRotation(data.rotation, 8);
        },
        serializeFull(stream, data): void {
            this.serializePartial(stream, data);
        },
        deserializePartial(stream) {
            return {
                position: stream.readPosition(),
                rotation: stream.readRotation(8)
            };
        },
        deserializeFull(stream, type) {
            return this.deserializePartial(stream, type);
        }
    },
    //
    // Explosion Serialization
    //
    [ObjectCategory.Explosion]: {
        serializePartial(stream, data): void {
            stream.writePosition(data.position);
        },
        serializeFull(stream, data): void {
            this.serializePartial(stream, data);
        },
        deserializePartial(stream) {
            return {
                position: stream.readPosition()
            };
        },
        deserializeFull(stream, type) {
            return this.deserializePartial(stream, type);
        }
    },
    //
    // Emote Serialization
    //
    [ObjectCategory.Emote]: {
        serializePartial(stream, data): void {
            stream.writeObjectID(data.playerID);
        },
        serializeFull(stream, data): void {
            this.serializePartial(stream, data);
        },
        deserializePartial(stream) {
            return {
                playerID: stream.readObjectID()
            };
        },
        deserializeFull(stream, type) {
            return this.deserializePartial(stream, type);
        }
    }
};
