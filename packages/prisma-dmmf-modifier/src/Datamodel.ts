import { type DMMF } from "@prisma/generator-helper";
import { type datamodel } from "./types";
import {
  defaultRelationIdField,
  defaultRelationObjectField,
} from "./commands/defaults";

export class Datamodel {
  constructor(private datamodel: datamodel) {}
  addField(
    modelName: string,
    field: DMMF.Field,
    isManyToManyRelation = false,
    removeIfExistOldName?: string
  ) {
    const modelIndex = this.datamodel.models.findIndex(
      (m) => m.name === modelName
    );
    if (modelIndex === -1) return this;

    if (removeIfExistOldName)
      this.removeField(modelName, { ...field, name: removeIfExistOldName });

    const { newFieldToBeNamed } = this.getFieldNewName(
      this.datamodel.models[modelIndex],
      field.name
    );
    field.name = newFieldToBeNamed;

    if (!field.relationName) {
      this.datamodel.models[modelIndex].fields.push(field);
    } else {
      const { newFieldToBeNamed } = this.getFieldNewName(
        this.datamodel.models[modelIndex],
        field.relationName,
        "relationName"
      );
      field.relationName = newFieldToBeNamed;

      this.datamodel.models[modelIndex].fields.push(field);

      const relationModelName = field.type;
      const foreignModelIndex = this.datamodel.models.findIndex(
        (m) => m.name === relationModelName
      );
      if (foreignModelIndex === -1) return this;

      const relationModelNewFields: DMMF.Field[] = [];

      const relationType: "1-1" | "1-n" | "n-m" = isManyToManyRelation
        ? "n-m"
        : field.isList
        ? "1-n"
        : "1-1";

      const { newFieldToBeNamed: newIdFieldToBeNamed } = this.getFieldNewName(
        this.datamodel.models[foreignModelIndex],
        modelName.toLowerCase() + "Id"
      );

      const idFieldName = newIdFieldToBeNamed;
      let primaryKeyData = this.datamodel.models[modelIndex].fields.find(
        (f) => f.isId
      );

      // in case from table does not have an id, add it.
      if (!primaryKeyData) {
        primaryKeyData = {
          name: "id",
          kind: "scalar",
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: true,
          isReadOnly: false,
          hasDefaultValue: true,
          type: "Int",
          default: {
            name: "autoincrement",
            args: [],
          },
          isGenerated: false,
          isUpdatedAt: false,
        };
        this.datamodel.models[modelIndex].fields.push(primaryKeyData);
      }
      const addAtRelationToForeignTable =
        (field.relationFromFields?.length || 0) === 0 && relationType !== "n-m";

      const objectField: DMMF.Field = {
        ...defaultRelationObjectField,
        type: modelName,
        relationName: field.relationName,
        relationFromFields: addAtRelationToForeignTable ? [idFieldName] : [],
        relationToFields: addAtRelationToForeignTable
          ? [primaryKeyData.name]
          : [],
      };

      switch (relationType || "1-n") {
        case "1-1": {
          const foreignKeyField: DMMF.Field = {
            ...defaultRelationIdField,
            name: idFieldName,
            type: primaryKeyData.type,
            isUnique: true,
          };

          const { newFieldToBeNamed: newObjectFieldToBeNamed } =
            this.getFieldNewName(
              this.datamodel.models[foreignModelIndex],
              objectField.name
            );

          relationModelNewFields.push(
            {
              ...objectField,
              name: newObjectFieldToBeNamed,
              isUnique: true,
            },
            foreignKeyField
          );
          break;
        }
        case "1-n": {
          const foreignKeyField: DMMF.Field = {
            ...defaultRelationIdField,
            name: idFieldName,
            type: primaryKeyData.type,
          };

          const { newFieldToBeNamed: newObjectFieldToBeNamed } =
            this.getFieldNewName(
              this.datamodel.models[foreignModelIndex],
              objectField.name + "s"
            );
          relationModelNewFields.push(
            {
              ...objectField,
              name: newObjectFieldToBeNamed,
            },
            foreignKeyField
          );
          break;
        }
        case "n-m": {
          relationModelNewFields.push({
            ...objectField,
            isList: true,
            isRequired: true,
          });
          break;
        }

        default:
          break;
      }
      this.datamodel.models[foreignModelIndex].fields.push(
        ...relationModelNewFields
      );
    }
    return this;
  }

  removeField(modelName: string, field: DMMF.Field) {
    const modelIndex = this.datamodel.models.findIndex(
      (m) => m.name === modelName
    );
    if (modelIndex === -1) return this;

    const fieldsToBeRemoved = [...(field.relationFromFields || []), field.name];

    this.datamodel.models[modelIndex].fields = this.datamodel.models[
      modelIndex
    ].fields.filter((f) => !fieldsToBeRemoved.includes(f.name));

    const relationName = field.relationName;

    if (relationName) {
      const foreignModelIndex = this.datamodel.models.findIndex(
        (m) => m.name === field.type
      );
      if (foreignModelIndex === -1) return this;

      const foreignFieldsToBeRemoved: string[] = [];
      this.datamodel.models[foreignModelIndex].fields = this.datamodel.models[
        foreignModelIndex
      ].fields
        .filter((f) => {
          if (f.relationName !== relationName) {
            foreignFieldsToBeRemoved.push(...(f.relationFromFields || []));
            return true;
          }
          return false;
        })
        .filter((f) => !foreignFieldsToBeRemoved.includes(f.name));
    }

    return this;
  }
  get() {
    return this.datamodel;
  }
  getFieldNewName(
    model: DMMF.Model,
    fieldName: string,
    searchBy: string | undefined = "name"
  ) {
    const fieldIndex = model.fields.findIndex((f) => f[searchBy] === fieldName);

    let fieldExists = fieldIndex !== -1;
    let fieldDuplication = "";
    if (fieldExists) {
      for (let i = 1; fieldExists; i++) {
        const fieldIndex = model.fields.findIndex(
          (f) => f[searchBy] === `${fieldName}${i}`
        );
        if (fieldIndex === -1) {
          fieldDuplication = i.toString();
          fieldExists = false;
        }
      }
    }
    return {
      fieldDuplication,
      newFieldToBeNamed: `${fieldName}${fieldDuplication}`,
    };
  }
}
